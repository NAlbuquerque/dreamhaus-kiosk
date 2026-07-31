"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEveAgent, type EveMessage } from "eve/react";
import KioskShell from "@/components/kiosk-shell";
import ConversationView, { type Message } from "@/components/conversation-view";
import CameraCapture from "@/components/camera-capture";
import ChatInput from "@/components/chat-input";
import OutfitBoard, { type OutfitItem } from "@/components/outfit-board";
import HandoffQr from "@/components/handoff-qr";
import DebugOverlay from "@/components/debug-overlay";
import { log } from "@/lib/logger";

// ─── Phase ─────────────────────────────────────────────────────────────────
type Phase = "welcome" | "name" | "photo" | "chat" | "products" | "qr";
type Palette = "autumn" | "winter" | "spring" | "summer";

const AGENT_TURN_TIMEOUT_MS = 30_000;

// ─── Helpers ───────────────────────────────────────────────────────────────

// Eve messages use parts[], not content. Extract plain text from text parts.
function extractText(msg: EveMessage): string {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

// Tool results live as "dynamic-tool" parts inside assistant messages.
// Check state === "output-available" so we only read finished calls.
// Returns the LAST occurrence so re-runs of the same tool (e.g. curate_outfit
// after a swap request) always surface the most recent result.
function findToolResult<T>(messages: readonly EveMessage[], toolName: string): T | null {
  let last: T | null = null;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type === "dynamic-tool" &&
        part.toolName === toolName &&
        part.state === "output-available"
      ) {
        last = part.output as T;
      }
    }
  }
  return last;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function KioskPage() {
  const [agentError, setAgentError] = useState<string | null>(null);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agent = useEveAgent({
    onError(err) {
      log.error("agent_turn_error", err);
      setAgentError("Something went wrong. Please try your request again.");
    },
  });

  // UI phase — server (Eve) drives conversation; client drives visual state
  const [phase, setPhase] = useState<Phase>("welcome");
  const [customerName, setCustomerName] = useState("");
  const [palette, setPalette] = useState<Palette>("spring");
  const [outfit, setOutfit] = useState<OutfitItem[]>([]);
  const [qrUrl, setQrUrl] = useState("");

  // Project Eve's EveMessage[] to a clean UI-friendly list of text bubbles.
  // Tool parts (dynamic-tool) are intentionally omitted — handled via useEffect.
  const messages: Message[] = useMemo(() => {
    return (agent.data?.messages ?? []).flatMap((msg) => {
      const text = extractText(msg);
      return text ? [{ role: msg.role as "assistant" | "user", content: text }] : [];
    });
  }, [agent.data?.messages]);

  const isLoading = agent.status === "submitted" || agent.status === "streaming";

  // ── Timeout guard: abort turns that take too long ─────────────────────────
  useEffect(() => {
    if (isLoading) {
      turnTimeoutRef.current = setTimeout(() => {
        log.warn("agent_turn_timeout", { status: agent.status });
        agent.stop();
        setAgentError("The assistant is taking too long. Please try again.");
      }, AGENT_TURN_TIMEOUT_MS);
    } else {
      if (turnTimeoutRef.current) {
        clearTimeout(turnTimeoutRef.current);
        turnTimeoutRef.current = null;
      }
      // Clear transient network errors once a turn completes successfully
      if (agent.status === "ready") {
        setAgentError(null);
      }
    }
    return () => {
      if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, agent.status]);

  // ── React to tool results appearing in the message stream ──────────────
  useEffect(() => {
    const eveMessages = agent.data?.messages ?? [];

    const outfitResult = findToolResult<{ outfit: OutfitItem[]; palette: Palette }>(
      eveMessages,
      "curate_outfit"
    );
    if (outfitResult && phase !== "qr") {
      setOutfit(outfitResult.outfit ?? []);
      setPalette(outfitResult.palette);
      if (phase !== "products") {
        setPhase("products");
      }
    }

    const handoffResult = findToolResult<{ qrUrl: string }>(eveMessages, "create_handoff");
    if (handoffResult && phase !== "qr") {
      setQrUrl(handoffResult.qrUrl ?? "");
      setPhase("qr");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.data?.messages]);

  // ── Start session and send the initial greeting trigger ─────────────────
  useEffect(() => {
    if (phase === "welcome" && agent.status === "ready" && messages.length === 0) {
      agent.send({ message: "Hello" });
      setPhase("name");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.status]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    agent.reset();
    setPhase("welcome");
    setCustomerName("");
    setPalette("spring");
    setOutfit([]);
    setQrUrl("");
    setAgentError(null);
  }, [agent]);

  const handleNameSubmit = useCallback(
    (text: string) => {
      setCustomerName(text);
      agent.send({ message: text }).catch((err) => {
        log.error("agent_send_failed", err, { phase: "name" });
        setAgentError("Failed to send. Please try again.");
      });
      setPhase("photo");
    },
    [agent]
  );

  const handlePhotoCapture = useCallback(
    (palette: Palette) => {
      setPalette(palette);
      agent
        .send({ message: `My colour analysis is complete — I have a ${palette} palette.` })
        .catch((err) => {
          log.error("agent_send_failed", err, { phase: "photo" });
          setAgentError("Failed to send. Please try again.");
        });
      setPhase("chat");
    },
    [agent]
  );

  const handlePhotoSkip = useCallback(() => {
    agent
      .send({ message: "Please skip the photo and assign a palette for me." })
      .catch((err) => {
        log.error("agent_send_failed", err, { phase: "photo_skip" });
        setAgentError("Failed to send. Please try again.");
      });
  }, [agent]);

  // Free-form style & occasion input — the agent interprets it and calls
  // curate_outfit when it has enough. Phase advances via tool-result detection.
  const handleChatSend = useCallback(
    (text: string) => {
      agent.send({ message: text }).catch((err) => {
        log.error("agent_send_failed", err, { phase });
        setAgentError("Failed to send. Please try again.");
      });
    },
    [agent, phase]
  );

  const handleProfileReady = useCallback(() => {
    agent.send({ message: "I'm ready to save my profile." }).catch((err) => {
      log.error("agent_send_failed", err, { phase: "products" });
      setAgentError("Failed to send. Please try again.");
    });
  }, [agent]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KioskShell onReset={handleReset}>
      <DebugOverlay
        phase={phase}
        customerName={customerName}
        palette={palette}
        outfit={outfit}
        qrUrl={qrUrl}
        agentStatus={agent.status}
        eveMessages={agent.data?.messages ?? []}
      />
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Conversation bubbles — always visible except on QR screen */}
        {phase !== "qr" && <ConversationView messages={messages} loading={isLoading} />}

        {/* Error banner — shown above the input when an agent turn fails */}
        {agentError && (
          <div
            style={{
              margin: "0 40px 8px",
              padding: "12px 16px",
              background: "rgba(180, 60, 60, 0.15)",
              border: "1px solid rgba(180, 60, 60, 0.4)",
              borderRadius: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "14px", color: "var(--dh-cream)", fontFamily: "var(--font-body)" }}>
              {agentError}
            </span>
            <button
              onClick={() => setAgentError(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--dh-slate)",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                padding: "0 4px",
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Phase-specific UI */}
        {phase === "name" && (
          <ChatInput
            key="name"
            onSubmit={handleNameSubmit}
            disabled={isLoading}
            placeholder="Your first name…"
          />
        )}

        {phase === "photo" && (
          <CameraCapture
            onCapture={handlePhotoCapture}
            onSkip={handlePhotoSkip}
          />
        )}

        {phase === "chat" && (
          <ChatInput
            key="chat"
            onSubmit={handleChatSend}
            disabled={isLoading}
            placeholder="Tell me about your style and the occasion…"
          />
        )}

        {phase === "products" && outfit.length > 0 && (
          <>
            <OutfitBoard outfit={outfit} palette={palette} onReady={handleProfileReady} />
            <ChatInput
              key="products"
              onSubmit={handleChatSend}
              disabled={isLoading}
              placeholder="Swap a piece, add an accessory, or say you're ready…"
            />
          </>
        )}

        {phase === "qr" && (
          <HandoffQr
            qrUrl={qrUrl}
            customerName={customerName}
            palette={palette}
            onComplete={handleReset}
          />
        )}
      </div>
    </KioskShell>
  );
}

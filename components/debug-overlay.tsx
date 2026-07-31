"use client";

import { useRef, useState } from "react";
import type { EveMessage } from "eve/react";
import type { OutfitItem } from "@/components/outfit-board";

type Phase = "welcome" | "name" | "photo" | "chat" | "products" | "qr";
type Palette = "autumn" | "winter" | "spring" | "summer";

interface ToolEvent {
  index: number;
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
}

interface DebugOverlayProps {
  phase: Phase;
  customerName: string;
  palette: Palette;
  outfit: OutfitItem[];
  qrUrl: string;
  agentStatus: string;
  eveMessages: readonly EveMessage[];
}

function extractToolEvents(messages: readonly EveMessage[]): ToolEvent[] {
  const events: ToolEvent[] = [];
  let index = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "dynamic-tool") {
        const p = part as Record<string, unknown>;
        events.push({
          index: index++,
          toolName: (p.toolName as string) ?? "unknown",
          state: (p.state as string) ?? "unknown",
          input: p.input,
          output: p.output,
        });
      }
    }
  }
  return events;
}

function buildQrPayloadPreview(
  customerName: string,
  palette: Palette,
  toolEvents: ToolEvent[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kFName: customerName || null,
    kSeasonalPalette: null,
    kOccasion: null,
    kGenderStyle: null,
    kBegin: null,
    kComplete: null,
  };

  for (const ev of toolEvents) {
    if (ev.toolName === "curate_outfit" && ev.input) {
      const inp = ev.input as Record<string, unknown>;
      payload.kSeasonalPalette = inp.palette ?? palette;
      payload.kOccasion = inp.occasion ?? null;
      payload.kGenderStyle = inp.genderStyle ?? null;
    }
    if (ev.toolName === "create_handoff") {
      if (ev.input) {
        const inp = ev.input as Record<string, unknown>;
        payload.kFName = inp.kFName ?? (customerName || null);
        payload.kSeasonalPalette = inp.kSeasonalPalette ?? payload.kSeasonalPalette;
        payload.kOccasion = inp.kOccasion ?? payload.kOccasion;
        payload.kGenderStyle = inp.kGenderStyle ?? payload.kGenderStyle;
      }
      if (ev.output) {
        const out = ev.output as Record<string, unknown>;
        payload._result = {
          code: out.code,
          handoffPath: out.handoffPath,
          qrUrl: out.qrUrl,
        };
      }
    }
  }

  if (!payload.kSeasonalPalette) payload.kSeasonalPalette = palette;
  return payload;
}

function JsonBlock({ value }: { value: unknown }) {
  const [collapsed, setCollapsed] = useState(true);
  const str = JSON.stringify(value, null, 2);
  const lines = str.split("\n");
  const preview = lines.slice(0, 3).join("\n") + (lines.length > 3 ? "\n  …" : "");

  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          margin: 0,
          fontSize: "10px",
          lineHeight: "1.5",
          color: "var(--dh-cream)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          opacity: 0.85,
        }}
      >
        {collapsed ? preview : str}
      </pre>
      {lines.length > 3 && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            marginTop: "2px",
            background: "none",
            border: "none",
            color: "var(--dh-brass)",
            fontSize: "9px",
            cursor: "pointer",
            padding: 0,
            letterSpacing: "0.05em",
          }}
        >
          {collapsed ? "▼ expand" : "▲ collapse"}
        </button>
      )}
    </div>
  );
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "9px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "var(--dh-brass)",
  marginBottom: "8px",
  borderBottom: "1px solid rgba(184,151,106,0.25)",
  paddingBottom: "4px",
};

const KV_LABEL: React.CSSProperties = {
  fontSize: "9px",
  color: "var(--dh-slate)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginRight: "6px",
  flexShrink: 0,
};

const KV_VALUE: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--dh-cream)",
  fontFamily: "monospace",
  wordBreak: "break-all",
};

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "4px" }}>
      <span style={KV_LABEL}>{label}</span>
      <span style={KV_VALUE}>{value || "—"}</span>
    </div>
  );
}

interface ScapiRequest {
  method: "GET" | "POST";
  url: string;
  status: number;
  durationMs: number;
  resultCount?: number;
}

function RequestList({ requests }: { requests: ScapiRequest[] }) {
  return (
    <div style={{ marginTop: "6px" }}>
      <span style={{ ...KV_LABEL, display: "block", marginBottom: "4px" }}>
        scapi requests ({requests.length})
      </span>
      {requests.map((req, i) => {
        const isOk = req.status >= 200 && req.status < 300;
        let path = req.url;
        try {
          const u = new URL(req.url);
          path = u.pathname + u.search;
        } catch {
          // keep full url
        }
        return (
          <div
            key={i}
            style={{
              marginBottom: "4px",
              paddingLeft: "6px",
              borderLeft: `2px solid ${isOk ? "#4a7a4a" : "#7a4a4a"}`,
            }}
          >
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "8px",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  background: req.method === "POST" ? "#5a4a7a" : "#3a5a7a",
                  color: "#ccc",
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}
              >
                {req.method}
              </span>
              <span
                style={{
                  fontSize: "8px",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  background: isOk ? "#2a4a2a" : "#4a2a2a",
                  color: isOk ? "#6bc46b" : "#c46b6b",
                  flexShrink: 0,
                }}
              >
                {req.status}
              </span>
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
                {req.durationMs}ms
              </span>
              {req.resultCount !== undefined && (
                <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
                  {req.resultCount} hit{req.resultCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: "9px",
                color: "var(--dh-slate)",
                fontFamily: "monospace",
                wordBreak: "break-all",
                marginTop: "2px",
                lineHeight: "1.4",
              }}
            >
              {path}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STATE_COLOR: Record<string, string> = {
  "output-available": "#6bc46b",
  "input-available": "#7fa7c0",
  pending: "#c19a6b",
  error: "#c46b6b",
};

export default function DebugOverlay({
  phase,
  customerName,
  palette,
  outfit,
  qrUrl,
  agentStatus,
  eveMessages,
}: DebugOverlayProps) {
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  if (process.env.NEXT_PUBLIC_DEBUG !== "true") return null;

  const toolEvents = extractToolEvents(eveMessages);
  const qrPayload = buildQrPayloadPreview(customerName, palette, toolEvents);

  return (
    <>
      {/* Toggle tab — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: open ? "340px" : 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 201,
          width: "28px",
          height: "72px",
          background: "rgba(13,12,11,0.95)",
          border: "1px solid var(--dh-brass)",
          borderRight: open ? "none" : "1px solid var(--dh-brass)",
          borderRadius: open ? "4px 0 0 4px" : "4px 0 0 4px",
          color: "var(--dh-brass)",
          fontSize: "8px",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          transition: "right 0.2s ease",
          fontFamily: "var(--font-body)",
        }}
      >
        <span style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: "8px", letterSpacing: "0.15em" }}>
          Debug
        </span>
        <span style={{ fontSize: "10px", transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s ease", lineHeight: 1 }}>
          ›
        </span>
      </button>

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          right: open ? 0 : "-340px",
          width: "340px",
          height: "100vh",
          zIndex: 200,
          background: "rgba(13,12,11,0.97)",
          borderLeft: "1px solid var(--dh-border, rgba(255,255,255,0.08))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "right 0.2s ease",
          fontFamily: "monospace",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(184,151,106,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "10px",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--dh-brass)",
            }}
          >
            Debug · IRIS
          </span>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {/* ── Section 1: Session State ── */}
          <div style={{ marginBottom: "20px" }}>
            <p style={SECTION_LABEL}>Session State</p>
            <KV label="phase" value={phase} />
            <KV label="agent" value={agentStatus} />
            <KV label="name" value={customerName} />
            <KV label="palette" value={palette} />
            <KV label="outfit" value={`${outfit.length} item${outfit.length !== 1 ? "s" : ""}`} />
            <KV label="qrUrl" value={qrUrl} />
          </div>

          {/* ── Section 2: QR Payload ── */}
          <div style={{ marginBottom: "20px" }}>
            <p style={SECTION_LABEL}>QR Payload</p>
            <JsonBlock value={qrPayload} />
          </div>

          {/* ── Section 3: Tool Events ── */}
          <div>
            <p style={SECTION_LABEL}>
              Tool Events ({toolEvents.length})
            </p>
            {toolEvents.length === 0 && (
              <span style={{ fontSize: "10px", color: "var(--dh-slate)" }}>
                No tool calls yet
              </span>
            )}
            {toolEvents.map((ev) => (
              <div
                key={ev.index}
                style={{
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--dh-cream)",
                      fontFamily: "monospace",
                    }}
                  >
                    {ev.toolName}
                  </span>
                  <span
                    style={{
                      fontSize: "8px",
                      padding: "1px 5px",
                      borderRadius: "3px",
                      background: STATE_COLOR[ev.state] ?? "#666",
                      color: "#000",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {ev.state}
                  </span>
                </div>
                {ev.input !== undefined && (
                  <div style={{ marginBottom: "4px" }}>
                    <span style={{ ...KV_LABEL, display: "block", marginBottom: "2px" }}>
                      input
                    </span>
                    <JsonBlock value={ev.input} />
                  </div>
                )}
                {ev.output !== undefined && (
                  <div>
                    <span style={{ ...KV_LABEL, display: "block", marginBottom: "2px" }}>
                      output
                    </span>
                    <JsonBlock value={ev.output} />
                  </div>
                )}
                {ev.output !== undefined &&
                  Array.isArray((ev.output as Record<string, unknown>)._requests) && (
                    <RequestList
                      requests={
                        (ev.output as Record<string, unknown>)._requests as ScapiRequest[]
                      }
                    />
                  )}
              </div>
            ))}
          </div>

          {/* ── Section 4: Raw Eve Messages ── */}
          <div style={{ marginTop: "8px" }}>
            <p style={SECTION_LABEL}>
              Eve Messages ({eveMessages.length})
            </p>
            {eveMessages.map((msg, i) => {
              const textParts = msg.parts.filter((p) => p.type === "text");
              const preview = textParts
                .map((p) => (p as { type: "text"; text: string }).text)
                .join(" ")
                .slice(0, 80);
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: "8px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "2px" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        color: msg.role === "assistant" ? "var(--dh-brass)" : "var(--dh-slate)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {msg.role}
                    </span>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>
                      {msg.parts.length} part{msg.parts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {preview && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "10px",
                        color: "var(--dh-cream)",
                        opacity: 0.6,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {preview}
                      {preview.length >= 80 ? "…" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

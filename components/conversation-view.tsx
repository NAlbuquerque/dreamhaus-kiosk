"use client";

import { useEffect, useRef } from "react";

export interface Message {
  role: "assistant" | "user";
  content: string;
}

interface ConversationViewProps {
  messages: Message[];
  loading?: boolean;
}

function LoadingDots() {
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--dh-slate)",
            display: "block",
            animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function ConversationView({ messages, loading = false }: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "24px 40px",
        overflowY: "auto",
        flex: 1,
      }}
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            animation: "bubbleIn 0.35s ease",
          }}
        >
          <div
            style={{
              maxWidth: "72%",
              padding: "16px 20px",
              background:
                msg.role === "assistant"
                  ? "var(--dh-surface)"
                  : "rgba(184, 151, 106, 0.15)",
              borderRadius: "2px",
              borderLeft:
                msg.role === "assistant" ? "2px solid var(--dh-brass)" : "none",
              borderRight:
                msg.role === "user" ? "2px solid var(--dh-brass)" : "none",
              fontSize: "17px",
              lineHeight: 1.6,
              color: msg.role === "assistant" ? "var(--dh-cream)" : "var(--dh-linen)",
              fontFamily:
                msg.role === "assistant" ? "var(--font-display)" : "var(--font-body)",
              fontWeight: msg.role === "assistant" ? 300 : 300,
            }}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {loading && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            animation: "bubbleIn 0.35s ease",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              background: "var(--dh-surface)",
              borderLeft: "2px solid var(--dh-brass)",
              borderRadius: "2px",
            }}
          >
            <LoadingDots />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

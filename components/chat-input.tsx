"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Minimal Web Speech API typings (not in the standard DOM lib) ────────────
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Type your reply…",
  autoFocus = true,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    recognitionRef.current?.stop();
    setListening(false);
    onSubmit(text);
    setValue("");
  }, [value, disabled, onSubmit]);

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setValue(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    setValue("");
    setListening(true);
    recognition.start();
  }, [listening]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      style={{
        padding: "0 40px 32px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
        flexShrink: 0,
        animation: "fadeSlideUp 0.35s ease",
      }}
    >
      {/* Voice button — only rendered where speech recognition is available */}
      {voiceSupported && (
        <button
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Speak"}
          style={{
            width: "56px",
            height: "56px",
            flexShrink: 0,
            borderRadius: "50%",
            background: listening ? "var(--dh-brass)" : "var(--dh-surface)",
            border: `1px solid ${listening ? "var(--dh-brass)" : "var(--dh-border)"}`,
            color: listening ? "var(--dh-noir)" : "var(--dh-brass)",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          {/* Pulse ring while listening */}
          {listening && (
            <span
              style={{
                position: "absolute",
                inset: "-6px",
                borderRadius: "50%",
                border: "2px solid var(--dh-brass)",
                animation: "micPulse 1.4s ease-out infinite",
              }}
            />
          )}
          {/* Microphone glyph */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
      )}

      {/* Text entry */}
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={listening ? "Listening…" : placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          flex: 1,
          padding: "18px 22px",
          background: "var(--dh-surface)",
          border: `1px solid ${listening ? "var(--dh-brass)" : "var(--dh-border)"}`,
          borderRadius: "2px",
          color: "var(--dh-cream)",
          fontSize: "18px",
          fontFamily: "var(--font-display)",
          outline: "none",
          cursor: "text",
          transition: "border-color 0.2s",
        }}
      />

      {/* Send */}
      <button
        onClick={submit}
        disabled={!canSend}
        style={{
          padding: "18px 30px",
          background: canSend ? "var(--dh-brass)" : "var(--dh-surface)",
          border: "1px solid var(--dh-border)",
          borderRadius: "2px",
          color: canSend ? "var(--dh-noir)" : "var(--dh-slate)",
          fontSize: "13px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: canSend ? "pointer" : "default",
          transition: "background 0.2s, color 0.2s",
          flexShrink: 0,
        }}
      >
        Send
      </button>
    </div>
  );
}

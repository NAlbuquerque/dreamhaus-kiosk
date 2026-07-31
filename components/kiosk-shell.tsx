"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const IDLE_TIMEOUT_MS = 90_000;
const RESET_COUNTDOWN_S = 10;

interface KioskShellProps {
  children: React.ReactNode;
  onReset: () => void;
}

export default function KioskShell({ children, onReset }: KioskShellProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelReset = useCallback(() => {
    setCountdown(null);
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    let remaining = RESET_COUNTDOWN_S;
    setCountdown(remaining);
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimer.current!);
        countdownTimer.current = null;
        setCountdown(null);
        onReset();
      }
    }, 1000);
  }, [onReset]);

  const resetIdleTimer = useCallback(() => {
    if (countdown !== null) {
      cancelReset();
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startCountdown, IDLE_TIMEOUT_MS);
  }, [countdown, cancelReset, startCountdown]);

  useEffect(() => {
    const events = ["touchstart", "mousemove", "keydown", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [resetIdleTimer]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--dh-noir)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Logo strip */}
      <header
        style={{
          padding: "24px 40px 0",
          display: "flex",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "13px",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "var(--dh-brass)",
          }}
        >
          DreamHaus
        </span>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </main>

      {/* Idle reset overlay */}
      {countdown !== null && (
        <div
          onClick={cancelReset}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(13, 12, 11, 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
            zIndex: 100,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "72px",
              color: "var(--dh-cream)",
              lineHeight: 1,
            }}
          >
            {countdown}
          </span>
          <p
            style={{
              fontSize: "16px",
              color: "var(--dh-slate)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Starting over in {countdown}s
          </p>
          <button
            onClick={cancelReset}
            style={{
              marginTop: "8px",
              padding: "16px 40px",
              background: "transparent",
              border: "1px solid var(--dh-brass)",
              color: "var(--dh-brass)",
              fontSize: "13px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

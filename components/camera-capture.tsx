"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Palette = "autumn" | "winter" | "spring" | "summer";
type Status = "idle" | "countdown" | "flash" | "analyzing";

const PALETTES: Palette[] = ["autumn", "winter", "spring", "summer"];

interface CameraCaptureProps {
  onCapture: (palette: Palette) => void;
  onSkip: () => void;
}

export default function CameraCapture({ onCapture, onSkip }: CameraCaptureProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [countdown, setCountdown] = useState(3);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startCountdown = useCallback(() => {
    setStatus("countdown");
    let count = 3;
    setCountdown(count);
    countdownRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        setStatus("flash");
        timerRef.current = setTimeout(() => {
          setStatus("analyzing");
          timerRef.current = setTimeout(() => {
            const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
            onCapture(palette);
          }, 2200);
        }, 350);
      }
    }, 1000);
  }, [onCapture]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
        padding: "16px 40px 32px",
      }}
    >
      {/* Viewfinder */}
      <div
        style={{
          position: "relative",
          width: "360px",
          aspectRatio: "3 / 4",
          overflow: "hidden",
          borderRadius: "2px",
          border: "1px solid var(--dh-border)",
          background: "linear-gradient(160deg, #1a1915 0%, #0d0c0b 55%, #131210 100%)",
        }}
      >
        {/* Corner brackets */}
        <div style={{ position: "absolute", top: 16, left: 16, width: 28, height: 28, borderTop: "1px solid var(--dh-brass)", borderLeft: "1px solid var(--dh-brass)", opacity: 0.5 }} />
        <div style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderTop: "1px solid var(--dh-brass)", borderRight: "1px solid var(--dh-brass)", opacity: 0.5 }} />
        <div style={{ position: "absolute", bottom: 16, left: 16, width: 28, height: 28, borderBottom: "1px solid var(--dh-brass)", borderLeft: "1px solid var(--dh-brass)", opacity: 0.5 }} />
        <div style={{ position: "absolute", bottom: 16, right: 16, width: 28, height: 28, borderBottom: "1px solid var(--dh-brass)", borderRight: "1px solid var(--dh-brass)", opacity: 0.5 }} />

        {/* Soft center glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse 60% 70% at 50% 38%, rgba(200,185,160,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Guide text */}
        {status === "idle" && (
          <p
            style={{
              position: "absolute",
              bottom: "20px",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: "11px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(200,185,160,0.28)",
            }}
          >
            Center yourself
          </p>
        )}

        {/* Countdown overlay */}
        {status === "countdown" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(13, 12, 11, 0.35)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "96px",
                color: "var(--dh-cream)",
                lineHeight: 1,
                animation: "countdownPulse 0.9s ease-in-out",
              }}
            >
              {countdown}
            </span>
          </div>
        )}

        {/* Flash */}
        {status === "flash" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--dh-cream)",
              animation: "flashFade 0.35s ease-out forwards",
            }}
          />
        )}

        {/* Analyzing overlay */}
        {status === "analyzing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(13, 12, 11, 0.7)",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "2px solid var(--dh-border)",
                borderTop: "2px solid var(--dh-brass)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p
              style={{
                fontSize: "13px",
                color: "var(--dh-slate)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Analyzing your palette
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      {status === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <button
            onClick={startCountdown}
            aria-label="Take photo"
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: "var(--dh-cream)",
              border: "4px solid var(--dh-brass)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "var(--dh-cream)",
                border: "2px solid var(--dh-brass)",
              }}
            />
          </button>

          <button
            onClick={onSkip}
            style={{
              background: "none",
              border: "none",
              color: "var(--dh-slate)",
              fontSize: "13px",
              letterSpacing: "0.1em",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            Skip — choose palette for me
          </button>
        </div>
      )}
    </div>
  );
}

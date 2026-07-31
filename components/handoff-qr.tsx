"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface HandoffQrProps {
  qrUrl: string;
  customerName: string;
  palette: string;
  onComplete: () => void;
}

const AUTO_RESET_S = 60;

export default function HandoffQr({ qrUrl, customerName, palette, onComplete }: HandoffQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RESET_S);

  // Render QR code
  useEffect(() => {
    if (!canvasRef.current || !qrUrl) return;
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#F5F0E6", light: "#0D0C0B" },
    });
  }, [qrUrl]);

  // Auto-reset countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onComplete]);

  const paletteName = palette.charAt(0).toUpperCase() + palette.slice(1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "32px 40px",
        gap: "28px",
        animation: "fadeSlideUp 0.5s ease",
      }}
    >
      {/* Headline */}
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "28px",
            color: "var(--dh-cream)",
            marginBottom: "8px",
          }}
        >
          Your {paletteName} edit is ready
          {customerName ? `, ${customerName}` : ""}.
        </p>
        <p style={{ fontSize: "14px", color: "var(--dh-slate)", letterSpacing: "0.05em" }}>
          Scan to bring it to your phone
        </p>
      </div>

      {/* QR Code */}
      <div
        style={{
          padding: "20px",
          background: "var(--dh-noir)",
          border: "1px solid var(--dh-brass)",
          borderRadius: "2px",
        }}
      >
        <canvas ref={canvasRef} />
      </div>

      {/* Palette accent line */}
      <div
        style={{
          width: "48px",
          height: "3px",
          background: `var(--palette-${palette})`,
          borderRadius: "2px",
        }}
      />

      {/* Auto-reset notice */}
      <p
        style={{
          fontSize: "12px",
          color: "var(--dh-slate)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Resetting in {secondsLeft}s
      </p>

      <button
        onClick={onComplete}
        style={{
          background: "none",
          border: "1px solid var(--dh-border)",
          color: "var(--dh-slate)",
          fontSize: "12px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "12px 28px",
          cursor: "pointer",
          borderRadius: "2px",
        }}
      >
        Start Over
      </button>
    </div>
  );
}

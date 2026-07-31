"use client";

import { useState } from "react";

export interface ColorVariant {
  colorId: string;
  colorName: string;
  imageUrl: string | null;
  swatchUrl: string | null;
}

export interface OutfitItem {
  slot: string;
  category: string;
  productId: string;
  productName: string;
  price: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  colorName: string | null;
  availableColors: ColorVariant[];
}

type Palette = "autumn" | "winter" | "spring" | "summer";

const PALETTE_LABELS: Record<Palette, string> = {
  autumn: "Autumn",
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

const PALETTE_COLORS: Record<Palette, { hex: string; name: string }[]> = {
  spring: [
    { hex: "#7BC47A", name: "Pistachio green" },
    { hex: "#4FAF9A", name: "Seafoam teal" },
    { hex: "#F0B83A", name: "Sunflower yellow" },
    { hex: "#E06050", name: "Coral red" },
    { hex: "#E88030", name: "Tangerine orange" },
  ],
  summer: [
    { hex: "#3ECFCF", name: "Aqua cyan" },
    { hex: "#7DDBC8", name: "Mint aquamarine" },
    { hex: "#F2B8A8", name: "Blush peach" },
    { hex: "#D85A48", name: "Dusty rose red" },
    { hex: "#D4A030", name: "Muted gold" },
  ],
  autumn: [
    { hex: "#6B7A2A", name: "Olive green" },
    { hex: "#C9A43A", name: "Harvest gold" },
    { hex: "#D4844A", name: "Burnt sienna" },
    { hex: "#B84030", name: "Brick red" },
    { hex: "#6B3A1E", name: "Dark chocolate" },
  ],
  winter: [
    { hex: "#92C4E0", name: "Sky blue" },
    { hex: "#A8B8D0", name: "Steel blue" },
    { hex: "#CC2A5A", name: "Raspberry pink" },
    { hex: "#9B3090", name: "Amethyst purple" },
    { hex: "#2A2060", name: "Midnight navy" },
  ],
};

// Map a color ID/name to a CSS background for the swatch fallback circle.
function colorIdToCss(colorId: string): string {
  const id = colorId.toLowerCase();
  if (/blk|black/.test(id)) return "#1a1a1a";
  if (/wht|white/.test(id)) return "#f0ede6";
  if (/nvy|navy/.test(id)) return "#1b2a4a";
  if (/red/.test(id)) return "#b91c1c";
  if (/blu|blue/.test(id)) return "#2563eb";
  if (/grn|green/.test(id)) return "#16a34a";
  if (/brn|brown|tan/.test(id)) return "#92400e";
  if (/pnk|pink/.test(id)) return "#ec4899";
  if (/gld|gold/.test(id)) return "#d97706";
  if (/slv|silver/.test(id)) return "#9ca3af";
  if (/gry|grey|gray/.test(id)) return "#6b7280";
  if (/ivr|ivory|cream/.test(id)) return "#f5f0e6";
  if (/prp|purple|plm|plum/.test(id)) return "#7c3aed";
  if (/org|orange/.test(id)) return "#ea580c";
  if (/yel|ylw|yellow/.test(id)) return "#d97706";
  if (/cml|camel/.test(id)) return "#c19a6b";
  if (/bge|beige/.test(id)) return "#d4c5a9";
  return "#888888";
}

interface OutfitBoardProps {
  outfit: OutfitItem[];
  palette: Palette;
  onReady: () => void;
}

export default function OutfitBoard({ outfit, palette, onReady }: OutfitBoardProps) {
  const paletteColor = `var(--palette-${palette})`;

  // Per-product color selection: productId → { colorId, imageUrl, colorName }
  const [colorSelections, setColorSelections] = useState<
    Record<string, { colorId: string; imageUrl: string | null; colorName: string }>
  >(() =>
    Object.fromEntries(
      outfit.map((item) => [
        item.productId,
        { colorId: item.colorName ?? "", imageUrl: item.imageUrl, colorName: item.colorName ?? "" },
      ])
    )
  );

  function selectColor(productId: string, variant: ColorVariant) {
    setColorSelections((prev) => ({
      ...prev,
      [productId]: { colorId: variant.colorId, imageUrl: variant.imageUrl, colorName: variant.colorName },
    }));
  }

  const paletteSwatches = PALETTE_COLORS[palette];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "0 40px 16px",
        overflowY: "auto",
        flex: "0 1 auto",
        minHeight: 0,
        maxHeight: "50vh",
        animation: "fadeSlideUp 0.5s ease",
      }}
    >
      {/* Palette badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "4px", background: paletteColor, borderRadius: "2px" }} />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "13px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: paletteColor,
          }}
        >
          Your {PALETTE_LABELS[palette]} Look
        </span>
      </div>

      {/* Product grid title + palette swatch strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dh-slate)",
            flexShrink: 0,
          }}
        >
          Selected Items
        </span>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {paletteSwatches.map((swatch) => (
            <div
              key={swatch.hex}
              title={swatch.name}
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "2px",
                background: swatch.hex,
                flexShrink: 0,
                animation: "swatchReveal 0.4s ease",
                transformOrigin: "left",
              }}
            />
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
        }}
      >
        {outfit.map((item, i) => {
          const sel = colorSelections[item.productId];
          const displayImage = sel?.imageUrl ?? item.imageUrl;
          const displayColor = sel?.colorName ?? item.colorName;
          const hasColors = item.availableColors.length > 1;

          return (
            <div
              key={item.productId + item.slot}
              style={{
                background: "var(--dh-surface)",
                border: "1px solid var(--dh-border)",
                borderRadius: "2px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                animation: `fadeSlideUp ${0.3 + i * 0.06}s ease`,
              }}
            >
              {/* Slot label */}
              <div
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--dh-border)",
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: paletteColor,
                  fontFamily: "var(--font-body)",
                }}
              >
                {item.slot}
              </div>

              {/* Image */}
              <div style={{ aspectRatio: "3/4", background: "var(--dh-onyx)", overflow: "hidden" }}>
                {displayImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayImage}
                    alt={item.imageAlt ?? item.productName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "opacity 0.2s" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ color: "var(--dh-slate)", fontSize: "11px" }}>No image</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: "10px", flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "13px",
                    color: "var(--dh-cream)",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {item.productName}
                </p>

                {/* Color name + swatch indicator */}
                {displayColor && (
                  <p style={{ fontSize: "11px", color: "var(--dh-slate)", letterSpacing: "0.06em" }}>
                    {displayColor}
                  </p>
                )}

                {item.price != null && (
                  <p style={{ fontSize: "12px", color: "var(--dh-brass)", marginTop: "auto" }}>
                    ${item.price.toFixed(0)}
                  </p>
                )}

                {/* Color swatches — only if product has multiple colors */}
                {hasColors && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "5px",
                      marginTop: "6px",
                      paddingTop: "6px",
                      borderTop: "1px solid var(--dh-border)",
                    }}
                  >
                    {item.availableColors.map((variant) => {
                      const isSelected = (sel?.colorId ?? item.colorName) === variant.colorId;
                      return (
                        <button
                          key={variant.colorId}
                          title={variant.colorName}
                          onClick={() => selectColor(item.productId, variant)}
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            border: isSelected
                              ? `2px solid var(--dh-brass)`
                              : "2px solid transparent",
                            outline: isSelected ? "1px solid var(--dh-border)" : "none",
                            outlineOffset: "1px",
                            padding: 0,
                            cursor: "pointer",
                            flexShrink: 0,
                            overflow: "hidden",
                            background: variant.swatchUrl ? "transparent" : colorIdToCss(variant.colorId),
                            transition: "border-color 0.15s",
                          }}
                        >
                          {variant.swatchUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={variant.swatchUrl}
                              alt={variant.colorName}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={onReady}
        style={{
          padding: "18px",
          background: "var(--dh-brass)",
          border: "none",
          color: "var(--dh-noir)",
          fontFamily: "var(--font-body)",
          fontSize: "13px",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          borderRadius: "2px",
          marginTop: "4px",
          flexShrink: 0,
        }}
      >
        Save My DreamHaus Profile
      </button>
    </div>
  );
}

import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import type { GenderStyle, Palette, Occasion } from "../lib/scapi.js";
import { PALETTE_TO_COLOR_PALETTE, OCCASION_TO_FACET, ALL_SLOT_DEFS, TIE_OCCASIONS } from "../lib/scapi.js";

const OPTIONAL_SLOTS = new Set(
  ALL_SLOT_DEFS.filter((d) => d.optional).map((d) => d.slot.toLowerCase())
);

// ─── Catalog types ────────────────────────────────────────────────────────────

interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  slot: string;
  category: string;
  genderStyle: GenderStyle[];
  palettes: string[];   // SCAPI facet values e.g. "Cool Winter"
  occasions: string[];  // SCAPI facet values e.g. "Party"
}

interface Catalog {
  syncedAt: string;
  totalProducts: number;
  products: CatalogProduct[];
}

// ─── Catalog loader ───────────────────────────────────────────────────────────

const CATALOG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/catalog.json"
);

let _catalog: Catalog | null = null;

function loadCatalog(): CatalogProduct[] {
  if (_catalog) return _catalog.products;
  try {
    const raw = readFileSync(CATALOG_PATH, "utf8");
    _catalog = JSON.parse(raw) as Catalog;
    return _catalog.products;
  } catch {
    return [];
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function score(
  product: CatalogProduct,
  paletteScapi: string,
  occasionScapi: string
): number {
  let s = 0;
  if (product.palettes.includes(paletteScapi)) s += 3;
  else if (product.palettes.includes("Neutral")) s += 1;
  else return 0; // palette mismatch — exclude regardless of occasion
  if (product.occasions.includes(occasionScapi)) s += 2;
  return s;
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

export default defineTool({
  description:
    "Search the DreamHaus product catalog to discover what is available for a given customer profile. " +
    "Returns the best-matching product options per outfit slot so you can make informed selections " +
    "before calling curate_outfit. Call this once after you know the customer's palette, style, and occasion. " +
    "Also call it when the customer wants to swap a specific slot — pass the slot name(s) in additionalSlots " +
    "to include optional accessories (Sunglasses, Belt, Hat) the customer asked for.",
  inputSchema: z.object({
    palette: z
      .enum(["autumn", "winter", "spring", "summer"])
      .describe("The customer's seasonal palette."),
    genderStyle: z
      .enum(["feminine", "masculine", "neutral"])
      .describe("The customer's style expression."),
    occasion: z
      .enum(["everyday", "date-night", "business", "formal", "weekend"])
      .describe("The occasion."),
    perSlot: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("How many product options to return per slot (default 3)."),
    additionalSlots: z
      .array(z.string())
      .optional()
      .describe(
        "Optional slot names to include beyond the default set — e.g. ['Sunglasses'], ['Belt'], ['Hat']. " +
        "Pass these when the customer explicitly requests a category not included by default."
      ),
  }),
  approval: never(),
  execute({ palette, genderStyle, occasion, perSlot, additionalSlots = [] }) {
    const products = loadCatalog();

    if (products.length === 0) {
      return {
        available: false,
        message: "Catalog index not yet built — run `pnpm sync-catalog` to populate it.",
        results: {},
      };
    }

    const paletteScapi = PALETTE_TO_COLOR_PALETTE[palette as Palette];
    const occasionScapi = OCCASION_TO_FACET[occasion as Occasion];
    const requestedOptional = new Set(additionalSlots.map((s) => s.toLowerCase()));

    // Filter to products for this genderStyle, score by palette+occasion match,
    // group by slot, and return the top perSlot options per slot.
    // Exclude optional slots unless explicitly requested via additionalSlots.
    const bySlot: Record<string, Array<{ id: string; name: string; price: number | null; match: string }>> = {};

    const withTie = TIE_OCCASIONS.includes(occasion as Occasion);

    const relevant = products
      .filter((p) => p.genderStyle.includes(genderStyle as GenderStyle))
      .filter((p) => p.slot !== "Tie" || withTie)
      .filter((p) => !OPTIONAL_SLOTS.has(p.slot.toLowerCase()) || requestedOptional.has(p.slot.toLowerCase()))
      .map((p) => ({ p, s: score(p, paletteScapi, occasionScapi) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s || (a.p.name < b.p.name ? -1 : 1));

    for (const { p, s } of relevant) {
      if (!bySlot[p.slot]) bySlot[p.slot] = [];
      if (bySlot[p.slot].length < perSlot) {
        const matchTags: string[] = [];
        if (p.palettes.includes(paletteScapi)) matchTags.push(palette);
        else if (p.palettes.includes("Neutral")) matchTags.push("neutral");
        if (p.occasions.includes(occasionScapi)) matchTags.push(occasion);
        bySlot[p.slot].push({
          id: p.id,
          name: p.name,
          price: p.price,
          match: matchTags.join(", ") || "catalog fallback",
        });
      }
    }

    const totalOptions = Object.values(bySlot).reduce((n, arr) => n + arr.length, 0);

    return {
      available: true,
      paletteFilter: paletteScapi,
      occasionFilter: occasionScapi,
      totalOptions,
      results: bySlot,
    };
  },
});

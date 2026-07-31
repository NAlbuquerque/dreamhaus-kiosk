// Salesforce B2C Commerce SCAPI integration.
// Implements two separate SLAS token flows and all SCAPI calls used by agent tools.

const BASE_URL = `https://${process.env.COMMERCE_API_SHORT_CODE}.api.commercecloud.salesforce.com`;
const ORG_ID = process.env.COMMERCE_API_ORG_ID!;
const SITE_ID = process.env.COMMERCE_API_SITE_ID!;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorVariant {
  colorId: string;
  colorName: string;
  imageUrl: string | null;
  swatchUrl: string | null;
}

export interface OutfitItem {
  slot: string; // "Top", "Bottom", "Dress", "Jacket", "Shoes", "Jewelry", "Bag", "Tie"
  category: string; // the cgid the item was drawn from
  productId: string;
  productName: string;
  price: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  colorName: string | null;
  availableColors: ColorVariant[];
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface ScapiSearchHit {
  productId: string;
  productName: string;
  price?: number;
}

interface ScapiSearchResult {
  total: number;
  hits?: ScapiSearchHit[];
}

interface ScapiImage {
  link?: string;
  alt?: string;
  title?: string;
}

interface ScapiImageGroup {
  viewType?: string;
  images?: ScapiImage[];
  variationAttributes?: Array<{ id: string; values: Array<{ value: string }> }>;
}

interface ScapiProduct {
  id: string;
  name?: string;
  imageGroups?: ScapiImageGroup[];
}

interface HandoffPayload {
  kBegin: string;
  kFName: string;
  kSeasonalPalette: string;
  kOccasion: string;
  kGenderStyle: string;
  kComplete: string;
}

export interface HandoffResult {
  code: string;
  handoffPath: string;
}

export interface ScapiRequest {
  method: "GET" | "POST";
  url: string;
  status: number;
  durationMs: number;
  resultCount?: number;
}

// ─── Token caches ─────────────────────────────────────────────────────────────

let searchTokenCache: TokenCache | null = null;
let handoffTokenCache: TokenCache | null = null;

async function fetchToken(
  clientId: string,
  clientSecret: string,
  extraParams: Record<string, string> = {}
): Promise<TokenCache> {
  const url = `${BASE_URL}/shopper/auth/v1/organizations/${ORG_ID}/oauth2/token`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    channel_id: SITE_ID,
    ...extraParams,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`SLAS token request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

export async function getSearchToken(): Promise<string> {
  if (searchTokenCache && Date.now() < searchTokenCache.expiresAt) {
    return searchTokenCache.accessToken;
  }
  searchTokenCache = await fetchToken(
    process.env.COMMERCE_API_CLIENT_ID!,
    process.env.COMMERCE_API_SLAS_SECRET!
  );
  return searchTokenCache.accessToken;
}

export async function getHandoffToken(): Promise<string> {
  if (handoffTokenCache && Date.now() < handoffTokenCache.expiresAt) {
    return handoffTokenCache.accessToken;
  }
  handoffTokenCache = await fetchToken(
    process.env.COMMERCE_API_HANDOFF_CLIENT_ID!,
    process.env.COMMERCE_API_HANDOFF_SECRET!,
    { scope: "c_handoff_write" }
  );
  return handoffTokenCache.accessToken;
}

// ─── Refinement mappings ────────────────────────────────────────────────────
// The kiosk uses simple enums; SFCC search refinements use display-label values.

export type Palette = "autumn" | "winter" | "spring" | "summer";
export type GenderStyle = "feminine" | "masculine" | "neutral";
export type Occasion = "everyday" | "date-night" | "business" | "formal" | "weekend";

export const PALETTE_TO_COLOR_PALETTE: Record<Palette, string> = {
  autumn: "Warm Autumn",
  winter: "Cool Winter",
  spring: "Warm Spring",
  summer: "Cool Summer",
};

export const OCCASION_TO_FACET: Record<Occasion, string> = {
  everyday: "Casual",
  "date-night": "Party",
  business: "Formal",
  formal: "Formal",
  weekend: "Sporty",
};

// Jewelry metal by palette: gold flatters warm/high-contrast Autumn & Winter,
// silver flatters Spring & Summer. (c_refinementColor facet: "Gold" / "Silver")
const PALETTE_TO_METAL: Record<Palette, "Gold" | "Silver"> = {
  autumn: "Gold",
  winter: "Gold",
  spring: "Silver",
  summer: "Silver",
};

// ─── Outfit slot definitions ──────────────────────────────────────────────────
// One coordinated head-to-toe look: a single product per garment/accessory slot.
// Categories are the live DreamHaus catalog cgids. `neutral` draws from womens.

export interface SlotDef {
  slot: string;
  category: string;
  genderStyle: GenderStyle[];
  jewelry?: boolean;
  optional?: boolean; // excluded by default; included only when customer requests it
}

// All possible slot→category pairings, tagged with which genderStyles use them.
// Used by both the runtime outfit builder and the catalog sync script.
// optional: true = slot is inactive by default; included only when the customer requests it.
export const ALL_SLOT_DEFS: SlotDef[] = [
  { slot: "Top",        category: "womens-rtw-tops-shirts",             genderStyle: ["feminine", "neutral"] },
  { slot: "Bottom",     category: "womens-rtw-bottoms",                 genderStyle: ["feminine", "neutral"] },
  { slot: "Dress",      category: "womens-rtw-dresses",                 genderStyle: ["feminine"] },
  { slot: "Jacket",     category: "womens-rtw-outerwear",               genderStyle: ["feminine", "neutral"] },
  { slot: "Shoes",      category: "womens-shoes",                       genderStyle: ["feminine", "neutral"] },
  { slot: "Jewelry",    category: "womens-accessories-jewelry",         genderStyle: ["feminine", "neutral"], jewelry: true },
  { slot: "Bag",        category: "womens-accessories-bags-wallets",    genderStyle: ["feminine", "neutral"] },
  { slot: "Sunglasses", category: "womens-accessories-sunglasses",      genderStyle: ["feminine", "neutral"], optional: true },
  { slot: "Belt",       category: "womens-accessories-belts",           genderStyle: ["feminine", "neutral"], optional: true },
  { slot: "Hat",        category: "womens-accessories-hats-scarves",    genderStyle: ["feminine", "neutral"], optional: true },
  { slot: "Top",        category: "mens-rtw-tops-shirts",               genderStyle: ["masculine"] },
  { slot: "Bottom",     category: "mens-rtw-bottoms",                   genderStyle: ["masculine"] },
  { slot: "Jacket",     category: "mens-rtw-outerwear",                 genderStyle: ["masculine"] },
  { slot: "Shoes",      category: "mens-shoes",                         genderStyle: ["masculine"] },
  { slot: "Tie",        category: "mens-accessories-ties",              genderStyle: ["masculine"] },
  { slot: "Bag",        category: "mens-accessories-bags-wallets",      genderStyle: ["masculine"] },
  { slot: "Sunglasses", category: "mens-accessories-sunglasses",        genderStyle: ["masculine"], optional: true },
  { slot: "Belt",       category: "mens-accessories-belts",             genderStyle: ["masculine"], optional: true },
  { slot: "Hat",        category: "mens-accessories-hats-scarves",      genderStyle: ["masculine"], optional: true },
];

const JACKET_OCCASIONS: Occasion[] = ["business", "formal", "date-night", "everyday"];
export const TIE_OCCASIONS: Occasion[] = ["business", "formal"];

function slotsFor(
  genderStyle: GenderStyle,
  occasion: Occasion,
  additionalSlots: string[] = []
): SlotDef[] {
  const withJacket = JACKET_OCCASIONS.includes(occasion);
  const withTie = TIE_OCCASIONS.includes(occasion);
  const requested = new Set(additionalSlots.map((s) => s.toLowerCase()));
  return ALL_SLOT_DEFS.filter(
    (def) =>
      def.genderStyle.includes(genderStyle) &&
      (def.slot !== "Jacket" || withJacket) &&
      (def.slot !== "Tie" || withTie) &&
      (!def.optional || requested.has(def.slot.toLowerCase()))
  );
}

// ─── Outfit curation ────────────────────────────────────────────────────────

export async function curateOutfit(
  accessToken: string,
  opts: {
    palette: Palette;
    genderStyle: GenderStyle;
    occasion: Occasion;
    selections?: Record<string, string>; // slot → productId pre-chosen by agent
    additionalSlots?: string[]; // optional slots requested by customer e.g. ["Sunglasses"]
  },
  log?: ScapiRequest[]
): Promise<OutfitItem[]> {
  const { palette, genderStyle, occasion, selections = {}, additionalSlots = [] } = opts;
  const colorPalette = PALETTE_TO_COLOR_PALETTE[palette];
  const occasionFacet = OCCASION_TO_FACET[occasion];
  const metal = PALETTE_TO_METAL[palette];

  const slots = slotsFor(genderStyle, occasion, additionalSlots);

  // For slots the agent pre-selected, bypass SCAPI search.
  // For the rest, use the progressive refinement fallback.
  const resolved = await Promise.all(
    slots.map((def) => {
      const preSelectedId = selections[def.slot];
      if (preSelectedId) {
        return Promise.resolve<PickedSlot>({
          slot: def.slot,
          category: def.category,
          productId: preSelectedId,
          productName: "",
          price: null,
        });
      }
      return pickForSlot(accessToken, def, colorPalette, occasionFacet, metal, log);
    })
  );
  const picked = resolved.filter((x): x is PickedSlot => x !== null);

  // Enrich with imagery in a single batch call (search hits carry no images).
  const images = await fetchImages(
    accessToken,
    picked.map((p) => p.productId),
    colorPalette,
    log
  );

  return picked.map((p) => {
    const enriched = images[p.productId];
    return {
      slot: p.slot,
      category: p.category,
      productId: p.productId,
      // For pre-selected products the search hit had no name; use what the products API returned.
      productName: p.productName || enriched?.name || p.productId,
      price: p.price ?? enriched?.price ?? null,
      imageUrl: enriched?.imageUrl ?? null,
      imageAlt: enriched?.imageAlt ?? p.productName,
      colorName: enriched?.colorName ?? null,
      availableColors: enriched?.availableColors ?? [],
    };
  });
}

interface PickedSlot {
  slot: string;
  category: string;
  productId: string;
  productName: string;
  price: number | null;
}

async function pickForSlot(
  accessToken: string,
  def: SlotDef,
  colorPalette: string,
  occasionFacet: string,
  metal: "Gold" | "Silver",
  log?: ScapiRequest[]
): Promise<PickedSlot | null> {
  const cat = `cgid=${def.category}`;

  // Most-specific → least-specific refinement sets. First non-empty wins.
  const attempts: string[][] = def.jewelry
    ? [
        [cat, `c_colorPalette=${colorPalette}`, `c_refinementColor=${metal}`],
        [cat, `c_refinementColor=${metal}`],
        [cat, `c_colorPalette=${colorPalette}`],
        [cat, `c_colorPalette=Neutral`],
        [cat],
      ]
    : [
        [cat, `c_colorPalette=${colorPalette}`, `c_occasion=${occasionFacet}`],
        [cat, `c_colorPalette=${colorPalette}`],
        [cat, `c_colorPalette=Neutral`, `c_occasion=${occasionFacet}`],
        [cat, `c_colorPalette=Neutral`],
        [cat],
      ];

  for (const refinements of attempts) {
    const hits = await runSearch(accessToken, refinements, 8, log);
    if (hits.length > 0) {
      // Pick from the top matches for gentle variety between sessions.
      const hit = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
      return {
        slot: def.slot,
        category: def.category,
        productId: hit.productId,
        productName: hit.productName,
        price: hit.price ?? null,
      };
    }
  }
  return null;
}

export async function runSearch(
  accessToken: string,
  refinements: string[],
  limit: number,
  log?: ScapiRequest[]
): Promise<ScapiSearchHit[]> {
  const params = new URLSearchParams({ siteId: SITE_ID, limit: String(limit) });
  // refine must be appended as repeated params — URLSearchParams encodes spaces
  for (const r of refinements) params.append("refine", r);

  const url = `${BASE_URL}/search/shopper-search/v1/organizations/${ORG_ID}/product-search?${params}`;

  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const durationMs = Date.now() - t0;

  if (!res.ok) {
    log?.push({ method: "GET", url, status: res.status, durationMs });
    throw new Error(`SCAPI product search failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as ScapiSearchResult;
  const hits = data.hits ?? [];
  log?.push({ method: "GET", url, status: res.status, durationMs, resultCount: hits.length });
  return hits;
}

const PALETTE_KEYWORDS: Record<string, string[]> = {
  "Warm Autumn": ["brown","tan","camel","rust","sienna","gold","olive","burgundy","chocolate","amber","ivory","cream","beige","taupe","cognac","earth","warm","honey","ochre","chestnut","walnut","terracotta","copper","burnt","harvest","orange","khaki","sand","toffee"],
  "Cool Winter": ["navy","blue","black","charcoal","grey","gray","ice","silver","white","cool","arctic","midnight","slate","steel","cobalt","indigo","teal","frost","crisp"],
  "Warm Spring": ["peach","blush","coral","cream","ivory","yellow","pink","apricot","salmon","spring","fresh","warm","pastel","light","aqua","turquoise"],
  "Cool Summer": ["sage","lavender","mauve","lilac","cool","muted","grey","gray","soft","powder","dusty","periwinkle","blue","slate","rose"],
};

// Colors that work across all palettes — used as fallback when no palette match exists.
const NEUTRAL_KEYWORDS = ["black","white","grey","gray","beige","ivory","cream","tan","nude","natural","stone","sand","taupe","bone","ecru","oatmeal","khaki","camel","off-white","charcoal"];

// Choose the color variant whose name best matches the seasonal palette keywords.
// Falls back to the first available color if none score positively.
function pickPaletteColor(colorIds: string[], colorPalette: string): string {
  const kws = PALETTE_KEYWORDS[colorPalette] ?? [];
  if (kws.length === 0) return colorIds[0];

  let best = colorIds[0];
  let bestScore = -1;
  for (const colorId of colorIds) {
    const lower = colorId.toLowerCase();
    const score = kws.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = colorId; }
  }
  return best;
}

// Batch-fetch product imagery. Search hits don't include images, so we resolve
// them from the shopper-products endpoint's imageGroups, skipping placeholders.
function buildColorData(groups: ScapiImageGroup[], colorPalette: string): {
  imageUrl: string | null;
  imageAlt: string | null;
  colorName: string | null;
  availableColors: ColorVariant[];
} {
  const large = groups.filter((g) => g.viewType === "large");
  const base = large.length ? large : groups.filter((g) => g.viewType !== "swatch");

  // Collect swatch images (viewType="swatch") keyed by color value.
  const swatchByColor = new Map<string, string>();
  for (const group of groups.filter((g) => g.viewType === "swatch")) {
    const colorAttr = group.variationAttributes?.find((va) => va.id === "color");
    const colorValue = colorAttr?.values[0]?.value;
    if (colorValue) {
      const swatchImg = group.images?.find((im) => im.link && !im.link.includes("no-image")) ?? group.images?.[0];
      if (swatchImg?.link) swatchByColor.set(colorValue, swatchImg.link);
    }
  }

  // Build a map of colorValue → large image groups.
  const byColor = new Map<string, ScapiImageGroup[]>();
  for (const group of base) {
    const colorAttr = group.variationAttributes?.find((va) => va.id === "color");
    const colorValue = colorAttr?.values[0]?.value;
    if (colorValue) {
      if (!byColor.has(colorValue)) byColor.set(colorValue, []);
      byColor.get(colorValue)!.push(group);
    }
  }

  if (byColor.size > 0) {
    const colors = [...byColor.keys()];
    const chosen = pickPaletteColor(colors, colorPalette);
    const pool = byColor.get(chosen)!.flatMap((g) => g.images ?? []);
    const real = pool.find((im) => im.link && !im.link.includes("no-image")) ?? pool[0] ?? null;

    const allColors: ColorVariant[] = colors.map((colorId) => {
      const colorPool = byColor.get(colorId)!.flatMap((g) => g.images ?? []);
      const img = colorPool.find((im) => im.link && !im.link.includes("no-image")) ?? colorPool[0];
      return {
        colorId,
        colorName: colorId,
        imageUrl: img?.link ?? null,
        swatchUrl: swatchByColor.get(colorId) ?? null,
      };
    });

    // Only show swatches that match the seasonal palette; fall back to neutrals
    // if none match, so off-palette colors are never presented to the user.
    const kws = PALETTE_KEYWORDS[colorPalette] ?? [];
    const paletteColors = allColors.filter((c) => kws.some((kw) => c.colorId.toLowerCase().includes(kw)));
    const neutralColors = allColors.filter((c) => NEUTRAL_KEYWORDS.some((kw) => c.colorId.toLowerCase().includes(kw)));
    const availableColors = paletteColors.length > 0 ? paletteColors : neutralColors.length > 0 ? neutralColors : allColors;

    return { imageUrl: real?.link ?? null, imageAlt: real?.alt ?? null, colorName: chosen, availableColors };
  }

  // No per-color image groups — fall back to the default images.
  const pool = base.flatMap((g) => g.images ?? []);
  const real = pool.find((im) => im.link && !im.link.includes("no-image")) ?? pool[0] ?? null;
  return { imageUrl: real?.link ?? null, imageAlt: real?.alt ?? null, colorName: null, availableColors: [] };
}

async function fetchImages(
  accessToken: string,
  productIds: string[],
  colorPalette: string,
  log?: ScapiRequest[]
): Promise<Record<string, { imageUrl: string | null; imageAlt: string; name: string; price: number | null; colorName: string | null; availableColors: ColorVariant[] }>> {
  if (productIds.length === 0) return {};

  const params = new URLSearchParams({
    siteId: SITE_ID,
    expand: "images,prices",
    allImages: "true",
    ids: productIds.join(","),
  });
  const url = `${BASE_URL}/product/shopper-products/v1/organizations/${ORG_ID}/products?${params}`;

  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const durationMs = Date.now() - t0;

  if (!res.ok) {
    log?.push({ method: "GET", url, status: res.status, durationMs });
    return {};
  }

  const data = (await res.json()) as { data?: (ScapiProduct & { price?: number })[] };
  const products = data.data ?? [];
  log?.push({ method: "GET", url, status: res.status, durationMs, resultCount: products.length });

  const map: Record<string, { imageUrl: string | null; imageAlt: string; name: string; price: number | null; colorName: string | null; availableColors: ColorVariant[] }> = {};
  for (const product of products) {
    const { imageUrl, imageAlt, colorName, availableColors } = buildColorData(product.imageGroups ?? [], colorPalette);
    map[product.id] = {
      imageUrl,
      imageAlt: imageAlt ?? product.name ?? "",
      name: product.name ?? "",
      price: product.price ?? null,
      colorName,
      availableColors,
    };
  }

  return map;
}

// ─── Handoff create ───────────────────────────────────────────────────────────

export async function createKioskHandoff(
  accessToken: string,
  payload: HandoffPayload,
  log?: ScapiRequest[]
): Promise<HandoffResult> {
  const url =
    `${BASE_URL}/custom/kiosk-handoff/v1/organizations/${ORG_ID}/handoffs` +
    `?siteId=${encodeURIComponent(SITE_ID)}`;

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const durationMs = Date.now() - t0;

  if (!res.ok) {
    log?.push({ method: "POST", url, status: res.status, durationMs });
    throw new Error(`Handoff create failed: ${res.status} ${await res.text()}`);
  }

  log?.push({ method: "POST", url, status: res.status, durationMs });
  return (await res.json()) as HandoffResult;
}

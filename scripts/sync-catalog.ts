/**
 * Crawls the DreamHaus SCAPI catalog and writes data/catalog.json.
 *
 * For each slot category it runs searches across every palette × occasion
 * combination to tag each product with the refinement values it appears under.
 * The result is a flat product index the search_products tool reads at runtime.
 *
 * Usage: pnpm sync-catalog
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_SLOT_DEFS, type SlotDef } from "../agent/lib/scapi";

// ─── Env ──────────────────────────────────────────────────────────────────────

const BASE_URL = `https://${process.env.COMMERCE_API_SHORT_CODE}.api.commercecloud.salesforce.com`;
const ORG_ID = process.env.COMMERCE_API_ORG_ID!;
const SITE_ID = process.env.COMMERCE_API_SITE_ID!;
const CLIENT_ID = process.env.COMMERCE_API_CLIENT_ID!;
const SLAS_SECRET = process.env.COMMERCE_API_SLAS_SECRET!;

if (!process.env.COMMERCE_API_SHORT_CODE || !ORG_ID || !SITE_ID || !CLIENT_ID || !SLAS_SECRET) {
  console.error("Missing required COMMERCE_API_* environment variables.");
  process.exit(1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  slot: string;
  category: string;
  genderStyle: string[];
  palettes: string[];
  occasions: string[];
}

const PALETTE_VALUES = ["Warm Autumn", "Cool Winter", "Warm Spring", "Cool Summer", "Neutral"];
const OCCASION_VALUES = ["Casual", "Party", "Formal", "Sporty"];

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const url = `${BASE_URL}/shopper/auth/v1/organizations/${ORG_ID}/oauth2/token`;
  const credentials = Buffer.from(`${CLIENT_ID}:${SLAS_SECRET}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", channel_id: SITE_ID });

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ─── Search ───────────────────────────────────────────────────────────────────

interface SearchHit { productId: string; productName: string; price?: number }

async function search(token: string, refinements: string[], limit = 200): Promise<SearchHit[]> {
  const params = new URLSearchParams({ siteId: SITE_ID, limit: String(limit) });
  for (const r of refinements) params.append("refine", r);
  const url = `${BASE_URL}/search/shopper-search/v1/organizations/${ORG_ID}/product-search?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.warn(`  Search failed (${res.status}) for ${refinements.join(", ")} — skipping`);
    return [];
  }
  const data = (await res.json()) as { hits?: SearchHit[] };
  return data.hits ?? [];
}

// ─── Per-category crawl ───────────────────────────────────────────────────────

async function crawlCategory(
  token: string,
  def: SlotDef
): Promise<CatalogProduct[]> {
  const cat = `cgid=${def.category}`;

  // Baseline: all products in the category
  const baselineHits = await search(token, [cat]);
  const productMap = new Map<string, CatalogProduct>();

  for (const hit of baselineHits) {
    productMap.set(hit.productId, {
      id: hit.productId,
      name: hit.productName,
      price: hit.price ?? null,
      slot: def.slot,
      category: def.category,
      genderStyle: def.genderStyle,
      palettes: [],
      occasions: [],
    });
  }

  // Palette searches — add palette tag to any product that surfaces
  await Promise.all(
    PALETTE_VALUES.map(async (palette) => {
      const hits = await search(token, [cat, `c_colorPalette=${palette}`]);
      for (const hit of hits) {
        if (!productMap.has(hit.productId)) {
          productMap.set(hit.productId, {
            id: hit.productId,
            name: hit.productName,
            price: hit.price ?? null,
            slot: def.slot,
            category: def.category,
            genderStyle: def.genderStyle,
            palettes: [],
            occasions: [],
          });
        }
        const p = productMap.get(hit.productId)!;
        if (!p.palettes.includes(palette)) p.palettes.push(palette);
      }
    })
  );

  // Occasion searches
  await Promise.all(
    OCCASION_VALUES.map(async (occasion) => {
      const hits = await search(token, [cat, `c_occasion=${occasion}`]);
      for (const hit of hits) {
        if (productMap.has(hit.productId)) {
          const p = productMap.get(hit.productId)!;
          if (!p.occasions.includes(occasion)) p.occasions.push(occasion);
        }
      }
    })
  );

  return [...productMap.values()];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("DreamHaus catalog sync starting...\n");

  const token = await getToken();
  console.log("SCAPI token obtained.\n");

  const allProducts: CatalogProduct[] = [];

  for (const def of ALL_SLOT_DEFS) {
    process.stdout.write(`Crawling ${def.category} (${def.slot})... `);
    const products = await crawlCategory(token, def);
    allProducts.push(...products);
    console.log(`${products.length} products`);
  }

  // Deduplicate: a product that appears in multiple slot defs (e.g. bags appear
  // in both mens and womens) gets its genderStyle arrays merged.
  const merged = new Map<string, CatalogProduct>();
  for (const p of allProducts) {
    if (merged.has(p.id)) {
      const existing = merged.get(p.id)!;
      for (const gs of p.genderStyle) {
        if (!existing.genderStyle.includes(gs)) existing.genderStyle.push(gs);
      }
    } else {
      merged.set(p.id, { ...p });
    }
  }

  const products = [...merged.values()];
  const catalog = {
    syncedAt: new Date().toISOString(),
    totalProducts: products.length,
    products,
  };

  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "catalog.json");
  writeFileSync(outPath, JSON.stringify(catalog, null, 2));

  console.log(`\nWrote ${products.length} products to data/catalog.json`);

  // Summary by slot
  const bySlot: Record<string, number> = {};
  for (const p of products) {
    bySlot[p.slot] = (bySlot[p.slot] ?? 0) + 1;
  }
  console.log("\nProducts per slot:");
  for (const [slot, count] of Object.entries(bySlot).sort()) {
    console.log(`  ${slot.padEnd(10)} ${count}`);
  }

  // Palette coverage
  const paletteCounts: Record<string, number> = {};
  for (const p of products) {
    for (const pal of p.palettes) {
      paletteCounts[pal] = (paletteCounts[pal] ?? 0) + 1;
    }
  }
  console.log("\nPalette coverage:");
  for (const [pal, count] of Object.entries(paletteCounts).sort()) {
    console.log(`  ${pal.padEnd(20)} ${count} products`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

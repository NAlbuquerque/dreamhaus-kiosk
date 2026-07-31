# DreamHaus Kiosk Shopping Agent — Implementation Plan

## Context

A self-contained kiosk prototype as a fallback for Salesforce Agentforce Guided Shopper (disabled, claimed back Aug 5 2026). Runs in a browser on a touch-screen kiosk. Built on Vercel Eve as the agent runtime with Google Gemini as the LLM. The kiosk captures the shopper's personalization profile (name, seasonal palette, occasion, gender style) and at the end calls the B2C Custom SCAPI handoff endpoint, which creates a persistent `KioskHandoff` record. The kiosk then displays a QR code the shopper scans on their phone to resume the personalized experience on the storefront. No basket or cart management in the kiosk.

## Handoff Payload (the "output" of the kiosk journey)

```json
{
  "kBegin": "<ISO-8601 session start>",
  "kFName": "<customer first name>",
  "kSeasonalPalette": "winter|spring|summer|autumn",
  "kOccasion": "everyday|date-night|business|formal|weekend",
  "kGenderStyle": "feminine|masculine|neutral",
  "kComplete": "<ISO-8601 session complete>"
}
```

→ Returns `{ code, handoffPath }` → kiosk renders QR for `https://{storefront}/handoff?data={code}`

## Architecture

**Next.js (App Router, latest) + Vercel Eve**, using Eve's official `withEve()` Next.js integration. One project, one process in dev, one deployment on Vercel. The Eve agent runs co-located with Next.js — no CORS, no separate server, no proxying.

```
dreamhaus-agent-search/
├── package.json
├── next.config.ts              ← withEve(nextConfig)
├── tsconfig.json
├── .env.local                  ← secrets (gitignored)
├── .gitignore
├── docs/                       ← this file + reference specs
├── app/                        ← Next.js App Router
│   ├── layout.tsx              ← full-screen kiosk layout, fonts
│   ├── page.tsx                ← redirect → /kiosk
│   ├── globals.css             ← brand tokens + kiosk CSS reset
│   └── kiosk/
│       └── page.tsx            ← 'use client' — mounts KioskShell
├── components/
│   ├── kiosk-shell.tsx         ← full-screen wrapper + idle reset (90s)
│   ├── conversation-view.tsx   ← renders agent.data.messages as bubbles
│   ├── camera-capture.tsx      ← getUserMedia, countdown, capture → send
│   ├── chat-input.tsx          ← open-ended text box + voice mic (Web Speech API)
│   ├── outfit-board.tsx        ← coordinated look, one card per slot
│   └── handoff-qr.tsx          ← QR code display + "Scan to continue" prompt
└── agent/
    ├── agent.ts                ← defineAgent + sessionData state store
    ├── instructions.md         ← guardrailed system prompt
    ├── lib/scapi.ts            ← SLAS auth + outfit curation + image enrichment + handoff
    └── tools/
        ├── curate_outfit.ts    ← per-slot SCAPI search → coordinated head-to-toe look
        └── create_handoff.ts   ← Custom SCAPI → returns code → QR displayed in UI
```

## Agent: IRIS

The assistant is named **IRIS** — DreamHaus personal style concierge. Powered by Google Gemini 3.6 Flash (multimodal — handles camera photo natively in conversation). Set `modelContextWindowTokens` explicitly in `agent.ts` (1,048,576) because Eve cannot resolve context-window metadata for a direct AI SDK model.

### Journey Steps

1. **Welcome** — Greet warmly, introduce IRIS, ask for name (via chat input — type or talk)
2. **Name** — Acknowledge name, explain palette analysis, prompt camera
3. **Photo** — Customer sends photo via webcam; Gemini analyzes skin undertone → reveals seasonal palette
4. **Style & Occasion (open conversation)** — No buttons. Customer **types or speaks freely**; IRIS interprets their words into a gender style (feminine/masculine/neutral) and occasion (everyday/date-night/business/formal/weekend), asking at most one gentle follow-up if unclear
5. **The Curated Look** — Call `curate_outfit` → a coordinated head-to-toe look (one piece per slot) rendered as a styled board
6. **Handoff** — Call `create_handoff` → QR code displayed

### Open-ended intake (type or talk)

The tap-only style/occasion pickers are replaced by a persistent `chat-input` component. It offers a text box **and** a microphone button backed by the browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). Speech is transcribed live into the same field the shopper can edit before sending. Where speech recognition is unavailable (e.g. Safari/Firefox), the mic button is simply not rendered and typing remains fully functional — a graceful degrade suited to a show-floor kiosk.

### Guardrails

- Only two tools: `curate_outfit` and `create_handoff`
- Off-topic → one warm redirect sentence
- Never invent product data
- Never break character
- 2–4 sentences max per response

## Tools

### `curate_outfit`

Input: `{ palette, genderStyle, occasion }` → Output: `{ palette, genderStyle, occasion, outfit: OutfitItem[], count }`

Instead of a flat product list, this tool assembles **one coordinated head-to-toe look** — a single product per garment/accessory slot. Slots depend on the style expression:

| genderStyle | Slots (one product each) |
|---|---|
| `feminine` | Top, Bottom, Dress, Jacket, Shoes, Jewelry, Bag |
| `neutral` | Top, Bottom, Jacket, Shoes, Jewelry, Bag (womens catalog) |
| `masculine` | Top, Bottom, Jacket, Shoes, Tie, Bag |

Each slot maps to a live catalog category (`cgid`), and every slot is resolved **in parallel**:

| Slot | cgid (womens / mens) |
|---|---|
| Top | `*-rtw-tops-shirts` |
| Bottom | `*-rtw-bottoms` |
| Dress | `womens-rtw-dresses` |
| Jacket | `*-rtw-outerwear` |
| Shoes | `*-shoes` |
| Jewelry | `*-accessories-jewelry` |
| Bag | `*-accessories-bags-wallets` |
| Tie | `mens-accessories-ties` |

**Refinement values** (verified against the live index — display labels; `URLSearchParams.append` handles space encoding):

| Kiosk enum | SCAPI refine | Values |
|---|---|---|
| `palette` | `c_colorPalette` | autumn→`Warm Autumn`, winter→`Cool Winter`, spring→`Warm Spring`, summer→`Cool Summer` (also `Neutral`) |
| `occasion` | `c_occasion` | everyday→`Casual`, date-night→`Party`, business→`Formal`, formal→`Formal`, weekend→`Sporty` |
| jewelry metal | `c_refinementColor` | autumn/winter→`Gold`, spring/summer→`Silver` |

**Per-slot relaxation** (first non-empty wins, so no slot is ever empty):
- Garments: `[cgid + palette + occasion]` → `[cgid + palette]` → `[cgid + Neutral palette]` → `[cgid + occasion]` → `[cgid]`
- Jewelry: `[cgid + palette + metal]` → `[cgid + metal]` → `[cgid + palette]` → `[cgid + Neutral palette]` → `[cgid]`

**Images:** product-search hits carry **no** image data. Images are resolved in a single batch call to the shopper-**products** endpoint (`GET /products?ids=…&expand=images&allImages=true`), reading `imageGroups` (prefer `viewType=large`) and skipping `no-image.jpg` placeholders.

**Inventory reality (Jul 2026 sandbox):** the catalog is heavily weighted to Warm Autumn / Cool Winter; Warm Spring & Cool Summer are nearly empty across categories, and womens silver jewelry is essentially absent (Gold 35 / Silver 1). The relaxation chain guarantees a complete look today. A future catalog-enrichment pass (assigning `c_colorPalette` + jewelry metal to more products, possibly via image analysis) would let strict palette/metal filtering return full-fidelity boards.

### `create_handoff`

Input: `{ kFName, kSeasonalPalette, kOccasion, kGenderStyle }`

Custom SCAPI endpoint:
- Auth: SLAS private client with `c_handoff_write` scope (separate credentials)
- Endpoint: `/custom/kiosk-handoff/v1/organizations/f_ecom_zzrl_002/handoffs?siteId=DreamHaus`
- Returns: `{ code, handoffPath }`
- QR URL: `{STOREFRONT_ORIGIN}{handoffPath}`

## SCAPI Credentials

```
Short code:   fbtn4943
Org ID:       f_ecom_zzrl_002
Site ID:      DreamHaus
Client ID:    5233ac0a-3883-44fb-aa23-cbfe0eb41711
Base URL:     https://fbtn4943.api.commercecloud.salesforce.com
```

## Environment Variables

```bash
GOOGLE_GENERATIVE_AI_API_KEY=...          # same key as GOOGLE_API_KEY in Dreamforce 26
COMMERCE_API_CLIENT_ID=5233ac0a-3883-44fb-aa23-cbfe0eb41711
COMMERCE_API_SLAS_SECRET=...
COMMERCE_API_ORG_ID=f_ecom_zzrl_002
COMMERCE_API_SHORT_CODE=fbtn4943
COMMERCE_API_SITE_ID=DreamHaus
COMMERCE_API_HANDOFF_CLIENT_ID=...        # separate private client for c_handoff_write
COMMERCE_API_HANDOFF_SECRET=...
STOREFRONT_ORIGIN=https://dreamhaus.example.com
```

## Key Dependencies

All at latest stable — no version pins.

- `eve` — Vercel agent framework
- `@ai-sdk/google` + `ai` — Gemini via AI SDK
- `next` + `react` + `react-dom` — UI
- `zod` — tool input schemas
- `qrcode` — QR code rendering

## Dev

```bash
pnpm install
pnpm dev
# → http://localhost:3000/kiosk
```

## Verification

1. `pnpm dev` → no errors, `eve info` shows both tools registered
2. `/kiosk` → full-screen dark, IRIS greets
3. Type or speak name → agent acknowledges → camera appears
4. Capture photo → Gemini reveals palette → open chat input appears
5. Type/speak style + occasion freely (e.g. "something elegant for a gala") → IRIS interprets
6. `curate_outfit` fires → coordinated look board renders (one card per slot)
7. Confirm → `create_handoff` fires → QR code displayed
8. Verify QR URL = `{STOREFRONT_ORIGIN}/handoff?data={code}`
9. 90s idle → reset countdown → welcome
10. Off-topic message → one warm redirect

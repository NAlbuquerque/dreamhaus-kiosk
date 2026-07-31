import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { sessionData } from "../agent.js";
import { getSearchToken, curateOutfit, type ScapiRequest } from "../lib/scapi.js";

export default defineTool({
  description:
    "Curate a complete, coordinated head-to-toe DreamHaus look for the customer — one piece per category " +
    "(top, bottom, dress, jacket, shoes, jewelry, bag, tie as applicable) in their seasonal color palette. " +
    "Also supports optional accessories: sunglasses, belt, hat — pass them in additionalSlots when the customer asks for them. " +
    "Call this once you know the customer's palette, style expression, and occasion. " +
    "The curated look is displayed on screen automatically. " +
    "Call again with updated selections if the customer wants to swap or replace any piece.",
  inputSchema: z.object({
    palette: z
      .enum(["autumn", "winter", "spring", "summer"])
      .describe("The customer's seasonal color palette."),
    genderStyle: z
      .enum(["feminine", "masculine", "neutral"])
      .describe("The customer's style expression."),
    occasion: z
      .enum(["everyday", "date-night", "business", "formal", "weekend"])
      .describe("The occasion the customer is dressing for."),
    selections: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Product IDs chosen via search_products, keyed by slot name (e.g. { Dress: 'pd-123', Shoes: 'pd-456' }). " +
        "Any slot omitted here will be filled automatically from the catalog."
      ),
    additionalSlots: z
      .array(z.string())
      .optional()
      .describe(
        "Optional accessory slots to include beyond the default set — e.g. ['Sunglasses'], ['Belt'], ['Hat']. " +
        "Pass these when the customer explicitly requests a category not included by default."
      ),
  }),
  approval: never(),
  async execute({ palette, genderStyle, occasion, selections, additionalSlots }) {
    sessionData.update((s) => ({
      ...s,
      kSeasonalPalette: palette,
      kGenderStyle: genderStyle,
      kOccasion: occasion,
    }));

    const token = await getSearchToken();
    const requests: ScapiRequest[] = [];
    const outfit = await curateOutfit(token, { palette, genderStyle, occasion, selections, additionalSlots }, requests);

    const filledSlots = new Set(outfit.map((item) => item.slot.toLowerCase()));
    const missedSlots = (additionalSlots ?? []).filter(
      (s) => !filledSlots.has(s.toLowerCase())
    );

    return {
      palette,
      genderStyle,
      occasion,
      outfit,
      count: outfit.length,
      missedSlots,
      _requests: requests,
    };
  },
});

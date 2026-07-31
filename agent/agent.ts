import { defineAgent } from "eve";
import { defineState } from "eve/context";
import { google } from "@ai-sdk/google";

export const sessionData = defineState("dreamhaus.session", () => ({
  kBegin: null as string | null,
  kFName: null as string | null,
  kSeasonalPalette: null as string | null,
  kOccasion: null as string | null,
  kGenderStyle: null as string | null,
}));

export default defineAgent({
  model: google("gemini-3.6-flash"),
  // Eve can't resolve context window metadata from the AI SDK directly —
  // provide it explicitly. Gemini 3.x Flash supports a 1M token context.
  modelContextWindowTokens: 1_048_576,
  compaction: { thresholdPercent: 0.85 },
});

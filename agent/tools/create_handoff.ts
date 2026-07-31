import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { sessionData } from "../agent.js";
import { getHandoffToken, createKioskHandoff, type ScapiRequest } from "../lib/scapi.js";

export default defineTool({
  description:
    "Create a persistent kiosk handoff record in Salesforce B2C Commerce. Returns a short code that the kiosk converts into a QR code. The customer scans the QR code on their phone to resume their personalized DreamHaus experience on the storefront. Call this when the customer confirms they are ready to take their profile with them.",
  inputSchema: z.object({
    kFName: z.string().describe("The customer's first name."),
    kSeasonalPalette: z
      .enum(["autumn", "winter", "spring", "summer"])
      .describe("The customer's determined seasonal color palette."),
    kOccasion: z
      .enum(["everyday", "date-night", "business", "formal", "weekend"])
      .describe("The occasion the customer is dressing for."),
    kGenderStyle: z
      .enum(["feminine", "masculine", "neutral"])
      .describe("The customer's chosen style expression."),
  }),
  approval: never(),
  async execute(input) {
    const state = sessionData.get();

    const payload = {
      kBegin: state.kBegin ?? new Date().toISOString(),
      kComplete: new Date().toISOString(),
      kFName: input.kFName,
      kSeasonalPalette: input.kSeasonalPalette,
      kOccasion: input.kOccasion,
      kGenderStyle: input.kGenderStyle,
    };

    const requests: ScapiRequest[] = [];
    const token = await getHandoffToken();
    const result = await createKioskHandoff(token, payload, requests);

    const storefrontOrigin = process.env.STOREFRONT_ORIGIN ?? "";
    const qrUrl = `${storefrontOrigin}${result.handoffPath}`;

    return {
      code: result.code,
      handoffPath: result.handoffPath,
      qrUrl,
      _requests: requests,
    };
  },
});

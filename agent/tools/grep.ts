import { disableTool } from "eve/tools";

// Guardrail: IRIS is a kiosk concierge with access to only curate_outfit
// and create_handoff. All general-purpose default tools are disabled.
export default disableTool();

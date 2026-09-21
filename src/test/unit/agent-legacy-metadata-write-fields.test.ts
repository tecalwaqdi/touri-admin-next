import { describe, expect, it } from "vitest";
import { buildAgentMetadataLegacyPatch } from "@/domain/agent/AgentLegacyMetadataWriteFields";

describe("Agent legacy metadata write patch", () => {
  it("allowlists legacy fields and excludes finance rates", () => {
    const patch = buildAgentMetadataLegacyPatch({
      displayName: "Agent One",
      phone: "+966501112233",
      countryId: "SA",
      countryDisplayName: "Saudi Arabia",
      activeFromUtc: "2024-01-01T00:00:00.000Z",
      activeToUtc: null,
    });
    expect(patch.display_name).toBe("Agent One");
    expect(patch.phone_number).toBe("+966501112233");
    expect(patch.Rev_dloh_agent).toEqual({
      path: "countries/saudi_arabia",
    });
    expect(patch.dolh_agent).toBe("Saudi Arabia");
    expect(patch.agent_date_reg).toBe("2024-01-01T00:00:00.000Z");
    expect(patch.agent_date_end).toBe(null);
    expect(patch).not.toHaveProperty("Agent_total");
    expect(patch).not.toHaveProperty("app_commission_percent");
    expect(patch).not.toHaveProperty("vat_percent");
  });
});

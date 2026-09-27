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

  it("copies country bounds onto agent bound fields", () => {
    const patch = buildAgentMetadataLegacyPatch({
      countryId: "saudi_arabia",
      countryBounds: {
        sw: { lat: 16, lng: 34.5 },
        ne: { lat: 32.2, lng: 55.7 },
        center: { lat: 24.7, lng: 46.7 },
      },
    });
    expect(patch).toMatchObject({
      agent_bounds_sw: { latitude: 16, longitude: 34.5 },
      agent_bounds_ne: { latitude: 32.2, longitude: 55.7 },
      agent_geo_center: { latitude: 24.7, longitude: 46.7 },
    });
  });
});

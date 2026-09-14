import { describe, expect, it } from "vitest";
import { isWithinScope } from "@/permissions/rbac";
import { assertScope, AuthorizationError } from "@/permissions/guards";

describe("scope enforcement", () => {
  it("allows global scope for any resource", () => {
    expect(isWithinScope({ type: "global" }, { countryId: "SA", cityId: "riyadh" })).toBe(
      true,
    );
  });

  it("enforces country scope", () => {
    expect(
      isWithinScope({ type: "country", countryIds: ["SA"] }, { countryId: "SA" }),
    ).toBe(true);
    expect(
      isWithinScope({ type: "country", countryIds: ["SA"] }, { countryId: "EG" }),
    ).toBe(false);
  });

  it("enforces city and agent scopes", () => {
    expect(
      isWithinScope({ type: "city", cityIds: ["dubai"] }, { cityId: "dubai" }),
    ).toBe(true);
    expect(
      isWithinScope({ type: "agent", agentIds: ["agent_sa_1"] }, { agentId: "agent_ae_1" }),
    ).toBe(false);
  });

  it("assertScope throws AuthorizationError outside scope", () => {
    expect(() =>
      assertScope({ type: "country", countryIds: ["SA"] }, { countryId: "AE" }),
    ).toThrow(AuthorizationError);
  });
});

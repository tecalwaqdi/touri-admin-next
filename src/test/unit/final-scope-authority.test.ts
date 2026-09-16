import { describe, it, expect } from "vitest";
import { enforceReadScope } from "@/infrastructure/production/contracts/ScopeExpansionGuard";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";

describe("scope authority cannot come from request hints", () => {
  it.each(["country", "agent", "city"] as const)("denies empty %s scope even with matching request hints", type => {
    expect(enforceReadScope({ actorScope: { type }, clientHint: { countryId: "saudi_arabia", agentId: "a", cityId: "c" } }).ok).toBe(false);
  });
  it("rejects city expansion rather than returning an unrestricted empty filter", () => {
    expect(enforceReadScope({ actorScope: { type: "city", cityIds: ["a"] }, clientHint: { cityId: "b" } })).toMatchObject({ ok: false, code: "SCOPE_EXPANSION_DENIED" });
  });
  it("denies a country detail when country assignments are empty", () => {
    expect(() => assertDetailResourceInScope({ type: "country", countryIds: [] }, { countryId: "saudi_arabia" })).toThrow();
  });
  it("keeps explicit global access and valid city intersection", () => {
    expect(enforceReadScope({ actorScope: { type: "global" } }).ok).toBe(true);
    expect(enforceReadScope({ actorScope: { type: "city", cityIds: ["a"] }, clientHint: { cityId: "a" } })).toMatchObject({ ok: true, serverFilter: { cityIds: ["a"] } });
  });
});

import { describe, expect, it } from "vitest";
import { currentPanelPersonaMatches } from "@/domain/auth/CurrentPanelPersona";
import { classifyAdminPanelPersona } from "@/domain/admin-users/AdminPanelPersona";
const data = { IsAdmin: true, isAdminRule: 1, active: true };
const persona = classifyAdminPanelPersona({ id: "admin", data });
if (!persona.included) throw new Error("fixture");
const identity = persona.mapped;
describe("current panel authority", () => {
  it("accepts unchanged server persona", () => expect(currentPanelPersonaMatches(identity, data)).toBe(true));
  it("denies deleted, disabled and downgraded personas with an otherwise valid token", () => {
    for (const changed of [null, { ...data, disabled: true }, { ...data, actev_user: false }, { ...data, active: false }, { IsAdmin: false, isAdminRule: 5 }]) expect(currentPanelPersonaMatches(identity, changed)).toBe(false);
  });
  it("denies stale country scopes", () => {
    const country = { isAdminRule: 2, Rev_dolh: { path: "countries/saudi_arabia" } };
    const scoped = classifyAdminPanelPersona({ id: "country-admin", data: country });
    expect(scoped.included).toBe(true);
    if (!scoped.included) return;
    expect(currentPanelPersonaMatches(scoped.mapped, country)).toBe(true);
    expect(currentPanelPersonaMatches(scoped.mapped, { ...country, Rev_dolh: { path: "countries/kyrgyzstan" } })).toBe(false);
  });
});

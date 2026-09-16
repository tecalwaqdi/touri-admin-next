import { describe, expect, it } from "vitest";
import { assertIdentityWriteAuthorization } from "@/application/controlled-writes/identity/IdentityWritePolicy";
import type { IdentityWriteCommand, IdentityWriteSnapshot, VerifiedIdentityWriteActor } from "@/application/controlled-writes/identity/IdentityWriteTypes";
const actor: VerifiedIdentityWriteActor = { uid: "admin", role: "super_admin", permissions: ["users:manage"], scope: { type: "global" } };
const snapshot: IdentityWriteSnapshot = { userId: "target", exists: true, isPanelPersona: true, role: "accountant", disabled: false, countryId: "saudi_arabia", agentId: null, superAdminCountHint: 2, preconditionToken: "v1", reconciliation: "UNKNOWN" };
const base = { actor, targetUserId: "target", expectedCurrentRole: "accountant" as const, expectedDisabled: false, preconditionToken: "v1", idempotencyKey: "key", correlationId: "c", reasonCode: "operational" };
const check = (command: IdentityWriteCommand, target = snapshot) => assertIdentityWriteAuthorization({ actor: command.actor, command, snapshot: target });
describe("identity authority limits", () => {
  it("blocks self scope expansion including clear scope", () => {
    for (const command of [{ ...base, targetUserId: actor.uid, action: "clear_scope" }, { ...base, targetUserId: actor.uid, action: "assign_country_scope", countryId: "SA" }, { ...base, targetUserId: actor.uid, action: "assign_agent_scope", agentId: "another", countryId: "SA" }] as IdentityWriteCommand[]) expect(check(command)).toMatchObject({ ok: false, code: "SELF_ESCALATION_DENIED" });
  });
  it("protects the last super administrator when count is unknown", () => {
    expect(check({ ...base, action: "deactivate" }, { ...snapshot, role: "super_admin", superAdminCountHint: null })).toMatchObject({ ok: false, code: "LAST_SUPER_ADMIN_PROTECTED" });
  });
  it("country authority cannot clear scope, create a global persona, or grant another country", () => {
    const countryActor = { ...actor, role: "country_admin" as const, scope: { type: "country" as const, countryIds: ["SA"] } };
    const cb = { ...base, actor: countryActor };
    for (const command of [{ ...cb, action: "clear_scope" }, { ...cb, action: "assign_role", role: "accountant" }, { ...cb, action: "assign_country_scope", countryId: "KG" }] as IdentityWriteCommand[]) expect(check(command).ok).toBe(false);
    expect(check({ ...cb, action: "assign_country_scope", countryId: "saudi_arabia" }).ok).toBe(true);
    expect(check({ ...cb, actor: { ...countryActor, scope: { type: "country", countryIds: [] } }, action: "activate" }).ok).toBe(false);
  });
  it("rejects arbitrary Firestore paths as country assignments", () => {
    expect(check({ ...base, action: "assign_country_scope", countryId: "user/another" }).ok).toBe(false);
  });
});

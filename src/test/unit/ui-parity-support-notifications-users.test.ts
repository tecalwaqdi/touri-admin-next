import { describe, expect, it } from "vitest";
import { looksLikeQaOrNoncanonicalUserId } from "@/domain/notifications/qaNotificationAudience";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("qaNotificationAudience", () => {
  it("accepts QA / noncanonical-looking ids", () => {
    expect(looksLikeQaOrNoncanonicalUserId("qa-user-1")).toBe(true);
    expect(looksLikeQaOrNoncanonicalUserId("test_admin_abc")).toBe(true);
    expect(looksLikeQaOrNoncanonicalUserId("fixture-persona")).toBe(true);
    expect(looksLikeQaOrNoncanonicalUserId("synthetic_panel")).toBe(true);
    expect(looksLikeQaOrNoncanonicalUserId("user_qa_sandbox")).toBe(true);
  });

  it("rejects empty and canonical-looking production ids", () => {
    expect(looksLikeQaOrNoncanonicalUserId("")).toBe(false);
    expect(looksLikeQaOrNoncanonicalUserId("   ")).toBe(false);
    expect(looksLikeQaOrNoncanonicalUserId("abc123RealUser")).toBe(false);
    expect(looksLikeQaOrNoncanonicalUserId("firebaseAuthUidXYZ")).toBe(false);
  });
});

describe("UI parity chrome — Support / Notifications / Users", () => {
  it("SupportWriteActions uses shared chrome + missing actions", () => {
    const s = src("src/features/support/SupportWriteActions.tsx");
    expect(s).toMatch(/isControlledWriteChromeEnabled/);
    expect(s).toMatch(/ControlledWriteConfirmPanel/);
    expect(s).toMatch(/categorize/);
    expect(s).toMatch(/update_priority/);
    expect(s).toMatch(/reassign/);
  });

  it("NotificationWriteActions exposes safe audiences", () => {
    const s = src("src/features/notifications/NotificationWriteActions.tsx");
    expect(s).toMatch(/isControlledWriteChromeEnabled/);
    expect(s).toMatch(/country_admins/);
    expect(s).toMatch(/user_ids/);
    expect(s).toMatch(/looksLikeQaOrNoncanonicalUserId/);
    expect(s).not.toMatch(/fcmTokens/);
  });

  it("Users page wires CreatePersona; identity actions include assign_agent_scope", () => {
    expect(src("src/features/users/UsersPage.tsx")).toMatch(/CreatePersonaPanel/);
    const identity = src("src/features/users/UserIdentityWriteActions.tsx");
    expect(identity).toMatch(/assign_agent_scope/);
    expect(identity).toMatch(/actorCanAssignRole/);
    expect(src("src/features/users/CreatePersonaPanel.tsx")).toMatch(
      /create_persona/,
    );
  });

  it("Roles page remains immutable with code SoT note", () => {
    const roles = src("src/features/roles/RolesPage.tsx");
    expect(roles).toMatch(/rolesMatrixHint/);
    expect(roles).toMatch(/rolesPermissionsCodeSoT/);
    expect(roles).not.toMatch(/create_persona|assign_role|POST/);
  });

  it("Notification compose route allows Fake offline without changing gate values", () => {
    const compose = src("src/app/api/notifications/compose/route.ts");
    expect(compose).toMatch(/allowOfflineExecution:\s*allowOffline/);
    expect(compose).toMatch(/FakePushDeliveryAdapter/);
    expect(compose).toMatch(/isControlledWriteChromeEnabled/);
  });
});

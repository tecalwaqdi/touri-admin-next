/**
 * PC-4 Users / Roles / Audit — tests 1–20.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  classifyAdminPanelPersona,
  looksLikeAdminPanelPersona,
} from "@/domain/admin-users/AdminPanelPersona";
import { PRODUCTION_ADMIN_USER_SOURCE } from "@/domain/admin-users/AdminUserSourceDecision";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";
import {
  mapControlledWriteAuditToEvent,
  matchesAuditFilters,
} from "@/domain/audit/mapControlledWriteAuditToEvent";
import { redactAuditRecord, redactAuditJson } from "@/domain/audit/redactAuditPayload";
import { getRolesPermissionMatrix } from "@/application/roles/RolesMatrixReadService";
import { ROLE_PERMISSION_MATRIX, permissionsForRole } from "@/permissions/rbac";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { FirebaseProductionAdminUserReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminUserReadRepository";
import { FirebaseProductionAdminAuditReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminAuditReadRepository";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PC-4 Users / Roles / Audit", () => {
  it("1: Users source decision rejects Auth listUsers and dedicated admin_users", () => {
    expect(PRODUCTION_ADMIN_USER_SOURCE.authListUsers).toBe(false);
    expect(PRODUCTION_ADMIN_USER_SOURCE.dedicatedAdminUsersCollection).toBe(
      false,
    );
    expect(PRODUCTION_ADMIN_USER_SOURCE.collection).toBe("user");
    expect(PRODUCTION_ADMIN_USER_SOURCE.transport).toBe("wif_native");
    expect(src("src/domain/admin-users/AdminUserSourceDecision.ts")).toMatch(
      /NOT USED|listUsers/,
    );
  });

  it("2: Audit source is admin_next_cw_audit and does not merge finance audit", () => {
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.collection).toBe(
      "admin_next_cw_audit",
    );
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.financeAuditMerged).toBe(false);
    expect(isCollectionAllowedForProductionRead("admin_next_cw_audit")).toBe(
      true,
    );
    expect(isCollectionAllowedForProductionRead("finance_audit_events")).toBe(
      false,
    );
  });

  it("3: Panel persona classification maps super_admin / country_admin / accountant", () => {
    const sa = classifyAdminPanelPersona({
      id: "u_sa",
      data: { IsAdmin: true, isAdminRule: 1, email: "a@ex.com", display_name: "SA" },
    });
    expect(sa.included).toBe(true);
    if (sa.included) expect(sa.role).toBe("super_admin");

    const ca = classifyAdminPanelPersona({
      id: "u_ca",
      data: {
        isAdminRule: 2,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
        display_name: "CA",
      },
    });
    expect(ca.included).toBe(true);
    if (ca.included) {
      expect(ca.role).toBe("country_admin");
      expect(ca.scope.countryIds?.[0]).toBe("saudi_arabia");
    }

    const fin = classifyAdminPanelPersona({
      id: "u_fin",
      data: { isAdminRule: 5, email: "f@ex.com" },
    });
    expect(fin.included).toBe(true);
    if (fin.included) expect(fin.role).toBe("accountant");
  });

  it("4: Drivers / pure agents / unsupported roles are excluded (no invented roles)", () => {
    expect(
      looksLikeAdminPanelPersona({ ismndob: true, display_name: "Driver" }),
    ).toBe(false);
    expect(
      classifyAdminPanelPersona({
        id: "agt",
        data: { Isagent: true, display_name: "Agent Only" },
      }).included,
    ).toBe(false);
    const partner = classifyAdminPanelPersona({
      id: "p",
      data: { isAdminRule: 3 },
    });
    expect(partner.included).toBe(false);
    expect(partner.dataQualityWarnings.some((w) => /unsupported/.test(w))).toBe(
      true,
    );
  });

  it("5: Roles matrix is code-defined rbac.ts only (no UI constants duplication)", () => {
    const matrix = getRolesPermissionMatrix();
    expect(matrix.source).toBe("code_defined_rbac");
    expect(matrix.mutable).toBe(false);
    expect(matrix.roles.length).toBeGreaterThan(0);
    for (const row of matrix.roles) {
      expect(row.permissions).toEqual(ROLE_PERMISSION_MATRIX[row.role]);
      expect(row.permissionCount).toBe(permissionsForRole(row.role).length);
    }
    const rolesUi = src("src/features/roles/RolesPage.tsx");
    expect(rolesUi).not.toMatch(/super_admin:\s*\[/);
    expect(rolesUi).toMatch(/\/api\/roles/);
  });

  it("6: Production users API wires AdminUserReadService when Production read armed", () => {
    const users = src("src/app/api/users/route.ts");
    expect(users).toMatch(/listProductionAdminUsers/);
    expect(users).toMatch(/users:manage/);
    expect(users).toMatch(/synthetic:\s*false/);
    const armedBlock =
      users.split("if (productionReadPathActive())")[1]?.split(
        'if (env.APP_ENV === "production"',
      )[0] ?? "";
    expect(armedBlock).toMatch(/listProductionAdminUsers/);
    expect(armedBlock).not.toMatch(/getRepositories\(\)\.users/);
  });

  it("7: User detail supports exact lookup with 404 vs 503 semantics", () => {
    const detail = src("src/app/api/users/[id]/route.ts");
    expect(detail).toMatch(/getProductionAdminUserDetail/);
    expect(detail).toMatch(/ADMIN_USER_NOT_FOUND/);
    expect(detail).toMatch(/status: 404/);
    expect(detail).toMatch(/status: 503/);
    expect(detail).toMatch(/SCOPE_DENIED/);
  });

  it("8: IDOR — country-scoped actor cannot see global or other-country admins", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "sa1",
        data: { IsAdmin: true, isAdminRule: 1, display_name: "Super", email: "s@ex.com" },
      },
      {
        id: "ca_sa",
        data: {
          isAdminRule: 2,
          Rev_dloh_agent: { path: "countries/saudi_arabia" },
          display_name: "CA SA",
        },
      },
      {
        id: "ca_ae",
        data: {
          isAdminRule: 2,
          Rev_dloh_agent: { path: "countries/united_arab_emirates" },
          display_name: "CA AE",
        },
      },
    ]);
    const repo = new FirebaseProductionAdminUserReadRepository(client);
    const listed = await repo.list({
      scope: { type: "country", countryIds: ["saudi_arabia"] },
      actorUid: "ca_sa",
    });
    expect(listed.items.map((i) => i.id).sort()).toEqual(["ca_sa"]);
    const forbidden = await repo.getById(
      { scope: { type: "country", countryIds: ["saudi_arabia"] }, actorUid: "ca_sa" },
      "sa1",
    );
    expect(forbidden.kind).toBe("forbidden");
    const other = await repo.getById(
      { scope: { type: "country", countryIds: ["saudi_arabia"] }, actorUid: "ca_sa" },
      "ca_ae",
    );
    expect(other.kind).toBe("forbidden");
    const driver = await repo.getById(
      { scope: { type: "global" }, actorUid: "sa1" },
      "missing_driver",
    );
    expect(driver.kind).toBe("not_found");
  });

  it("9: Admin user list masks email and never trusts client-derived roles", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "sa1",
        data: {
          IsAdmin: true,
          isAdminRule: 1,
          email: "superadmin@example.com",
          display_name: "Super",
        },
      },
    ]);
    const repo = new FirebaseProductionAdminUserReadRepository(client);
    const listed = await repo.list({
      scope: { type: "global" },
      actorUid: "sa1",
    });
    expect(listed.items[0]?.emailMasked).toBe("s***@example.com");
    expect(listed.items[0]?.roleSource).toBe("server_panel_claims_mirror");
    expect(listed.items[0]?.role).toBe("super_admin");
  });

  it("10: Audit list pageSize default ≤20 and max ≤50", () => {
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize).toBeLessThanOrEqual(
      20,
    );
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize).toBeLessThanOrEqual(50);
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize).toBeLessThanOrEqual(
      WIF_NATIVE_MAX_READ_LIMIT,
    );
    const auditRoute = src("src/app/api/audit/route.ts");
    expect(auditRoute).toMatch(/listProductionAdminAudit/);
    expect(auditRoute).toMatch(/pageSize/);
  });

  it("11: Audit events redact tokens/credentials", () => {
    const redacted = redactAuditRecord({
      token: "secret-value",
      password: "p",
      ok: true,
      nested: { access_token: "x", count: 1 },
    });
    expect(redacted?.token).toBe("[redacted]");
    expect(redacted?.password).toBe("[redacted]");
    expect((redacted?.nested as { access_token: string }).access_token).toBe(
      "[redacted]",
    );
    expect((redacted?.nested as { count: number }).count).toBe(1);
    const event = mapControlledWriteAuditToEvent({
      id: "a1",
      data: {
        kind: "AUDIT_RESULT",
        auditId: "a1",
        actorUid: "u1",
        actorRole: "super_admin",
        action: "needs_changes",
        resource: "driver",
        driverId: "d1",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
        correlationId: "c1",
        beforeSafe: { token: "nope", fromState: "pending_review" },
      },
    });
    expect(
      (event.beforeSnapshot as { token?: string } | undefined)?.token,
    ).toBe("[redacted]");
    expect(redactAuditJson({ refreshToken: "x" })).toEqual({
      refreshToken: "[redacted]",
    });
  });

  it("12: Audit filters are bounded to loaded page; cursor supported", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("admin_next_cw_audit", [
      {
        id: "a1",
        data: {
          kind: "AUDIT_RESULT",
          auditId: "a1",
          actorUid: "actor_a",
          action: "approve",
          resource: "driver",
          driverId: "d1",
          createdAtUtc: "2026-01-02T00:00:00.000Z",
          correlationId: "c1",
        },
      },
      {
        id: "a2",
        data: {
          kind: "AUDIT_INTENT",
          auditId: "a2",
          actorUid: "actor_b",
          action: "needs_changes",
          resource: "driver",
          driverId: "d2",
          createdAtUtc: "2026-01-01T00:00:00.000Z",
          correlationId: "c2",
        },
      },
    ]);
    const repo = new FirebaseProductionAdminAuditReadRepository(client);
    const filtered = await repo.list({
      pageSize: 20,
      actorUserId: "actor_a",
    });
    expect(filtered.filterScope).toBe("loaded_page");
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.actorUserId).toBe("actor_a");
    expect(
      matchesAuditFilters(filtered.items[0]!, { action: "approve" }),
    ).toBe(true);
  });

  it("13: Audit detail exact read returns 404 path for missing ids", () => {
    const detail = src("src/app/api/audit/[id]/route.ts");
    expect(detail).toMatch(/getProductionAdminAuditDetail/);
    expect(detail).toMatch(/AUDIT_EVENT_NOT_FOUND/);
    expect(detail).toMatch(/status: 404/);
  });

  it("14: No fixtures / synthetic Production fallback on users or audit armed paths", () => {
    assertNoProductionSyntheticFallback({
      appEnv: "production",
      syntheticSource: false,
    });
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK/);
    for (const file of [
      "src/app/api/users/route.ts",
      "src/app/api/audit/route.ts",
      "src/application/production-read/AdminUserReadService.ts",
      "src/application/production-read/AdminAuditReadService.ts",
    ]) {
      const text = src(file);
      expect(text).not.toMatch(/@touri\.local/);
      expect(text).toMatch(/synthetic:\s*false/);
    }
  });

  it("15: No write flags / ADC Admin SDK / new credential path on PC-4 surfaces", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    for (const file of [
      "src/application/production-read/AdminUserReadService.ts",
      "src/application/production-read/AdminAuditReadService.ts",
      "src/infrastructure/production/repositories/FirebaseProductionAdminUserReadRepository.ts",
      "src/infrastructure/production/repositories/FirebaseProductionAdminAuditReadRepository.ts",
    ]) {
      const text = src(file);
      expect(text).not.toMatch(/applicationDefault\s*\(/);
      expect(text).not.toMatch(/setCustomUserClaims/);
      expect(text).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
      expect(text).not.toMatch(/\bauth\.listUsers\b|\.listUsers\s*\(/);
      expect(text).toMatch(/wif_native|WIF|getProductionOperationalReadRuntime|FirestoreReadClient/);
    }
  });

  it("16: Users / Audit / Roles UI have SourceLabel, loading/empty/unavailable/forbidden", () => {
    const users = src("src/features/users/UsersPage.tsx");
    const audit = src("src/features/audit/AuditPage.tsx");
    const roles = src("src/features/roles/RolesPage.tsx");
    expect(users).toMatch(/SourceLabelBadge/);
    expect(users).toMatch(/StatusBadge/);
    expect(users).toMatch(/PermissionGuard permission="users:manage"/);
    expect(users).toMatch(/SourceNotConfiguredState|UnavailableState/);
    expect(audit).toMatch(/SourceLabelBadge/);
    expect(audit).toMatch(/audit:read/);
    expect(audit).toMatch(/SourceNotConfiguredState|UnavailableState/);
    expect(roles).toMatch(/PermissionGuard permission="users:manage"/);
    expect(roles).toMatch(/roles-matrix/);
  });

  it("17: AR/EN strings added for touched Users/Audit/Roles chrome", () => {
    const messages = src("src/i18n/messages.ts");
    for (const key of [
      "rolesPermissions",
      "rolesMatrixHint",
      "auditCwHint",
      "actor",
      "action",
      "selectEvent",
    ]) {
      expect(messages).toMatch(new RegExp(`${key}:`));
    }
    expect(messages).toMatch(/Roles & permissions/);
    expect(messages).toMatch(/الأدوار والصلاحيات/);
  });

  it("18: DQ warnings emitted for unmapped/invalid mappings without repairing Production", () => {
    const bad = classifyAdminPanelPersona({
      id: "bad",
      data: { isAdminRule: 2 }, // missing country → deny/unmap
    });
    expect(bad.included).toBe(false);
    expect(
      bad.dataQualityWarnings.some((w) => /unmapped_or_invalid/.test(w)),
    ).toBe(true);
    const repoSrc = src(
      "src/infrastructure/production/repositories/FirebaseProductionAdminUserReadRepository.ts",
    );
    expect(repoSrc).not.toMatch(
      /client\.(update|set|create)\s*\(|\.doc\([^)]*\)\.(update|set|create)\s*\(/,
    );
  });

  it("19: No Firebase Admin ADC in API users/audit/roles routes; WIF runtime reused", () => {
    const apiDir = join(process.cwd(), "src/app/api");
    for (const rel of ["users/route.ts", "users/[id]/route.ts", "audit/route.ts", "audit/[id]/route.ts", "roles/route.ts"]) {
      const text = readFileSync(join(apiDir, rel), "utf8");
      expect(text).not.toMatch(/applicationDefault\s*\(/);
      expect(text).not.toMatch(/FirebaseAdminFirestoreReadClient/);
    }
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/createWifNativeFirestoreRead/);
  });

  it("20: PC-4 does not reopen Auth/WIF ops or enable writes; finance FR7 untouched", () => {
    const fr7 = src(
      "src/adapters/finance/reporting/FinanceReportingSourcePorts.ts",
    );
    expect(fr7).not.toMatch(/finance_audit_events/);
    expect(fr7).toMatch(/FINANCE_REPORTING_RO_COLLECTIONS/);
    const envSample = [
      "PRODUCTION_WRITE_ENABLED",
      "DRIVER_WRITE_ENABLED",
      "AGENT_WRITE_ENABLED",
      "FINANCE_WRITE_ENABLED",
    ];
    // Ensure PC-4 services never flip write flags
    for (const file of readdirSync(
      join(process.cwd(), "src/application/production-read"),
    ).filter((f) => f.startsWith("Admin"))) {
      const text = src(`src/application/production-read/${file}`);
      for (const flag of envSample) {
        expect(text).not.toMatch(new RegExp(`${flag}\\s*=\\s*true`));
      }
    }
    expect(src("src/app/api/roles/route.ts")).not.toMatch(/POST|PUT|PATCH|DELETE/);
  });
});

/**
 * Accountant least-privilege — finance ledger/history vs global audit:read.
 *
 * Decision: finance:read already gates dashboard, settlements (incl. payment
 * history on detail), reconciliation, corrections, and driver-wallet ledger.
 * audit:read is Admin CW audit (admin_next_cw_audit) — drivers/agents/users —
 * and must stay DENIED for accountant. Do not invent finance:audit:read.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROLE_PERMISSION_MATRIX,
  hasPermission,
  permissionsForRole,
} from "@/permissions/rbac";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";
import { presentPermission } from "@/domain/presentation/permissionPresentation";

const ROOT = join(__dirname, "../../..");
function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const accountant = ROLE_PERMISSION_MATRIX.accountant;

describe("Accountant finance audit vs global audit:read", () => {
  it("keeps audit:read denied — global Admin CW audit is not finance-scoped", () => {
    expect(hasPermission(accountant, "audit:read")).toBe(false);
    expect(permissionsForRole("accountant")).not.toContain("audit:read");
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.financeAuditMerged).toBe(false);
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.collection).not.toBe(
      PRODUCTION_ADMIN_AUDIT_SOURCE.financeAuditCollection,
    );
  });

  it("finance ledger / settlement history / recon / corrections use finance:read", () => {
    expect(hasPermission(accountant, "finance:read")).toBe(true);
    expect(src("src/app/api/finance/dashboard/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/settlements/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/settlements/[id]/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/reconciliation/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/corrections/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/driver-wallets/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
    expect(src("src/app/api/finance/driver-wallets/[id]/route.ts")).toMatch(
      /requirePermission\(ctx, "finance:read"\)/,
    );
  });

  it("global /api/audit requires audit:read (not finance:read)", () => {
    expect(src("src/app/api/audit/route.ts")).toMatch(
      /requirePermission\(ctx, "audit:read"\)/,
    );
    expect(src("src/app/api/audit/route.ts")).toMatch(/admin_next_cw_audit|PRODUCTION_ADMIN_AUDIT_SOURCE/);
    expect(src("src/features/audit/AuditPage.tsx")).toMatch(
      /PermissionGuard permission="audit:read"/,
    );
    expect(src("src/config/navigation.ts")).toMatch(
      /href: "\/audit".*permission: "audit:read"/s,
    );
  });

  it("accountant ALLOW / DENY matrix for SoD + non-finance ops", () => {
    // ALLOW
    for (const p of [
      "finance:read",
      "reports:export",
      "settlements:prepare",
      "settlements:create",
    ] as const) {
      expect(hasPermission(accountant, p)).toBe(true);
    }
    // DENY — SoD + non-finance admin
    for (const p of [
      "settlements:approve",
      "settlements:execute",
      "settlements:reverse",
      "drivers:approve",
      "agents:manage",
      "users:manage",
      "audit:read",
    ] as const) {
      expect(hasPermission(accountant, p)).toBe(false);
    }
  });

  it("documents finance:read as covering finance history (not global audit)", () => {
    expect(presentPermission("finance:read", "en")).toBe("View financial data");
    expect(presentPermission("audit:read", "en")).toBe("View audit log");
    expect(src("src/permissions/rbac.ts")).toContain("do NOT");
    expect(src("src/permissions/rbac.ts")).toContain("add audit:read");
    expect(src("src/types/roles.ts")).toContain(
      "Accountants must use `finance:read`",
    );
    expect(src("src/domain/audit/AdminAuditSourceDecision.ts")).toContain(
      "never `audit:read`",
    );
  });
});

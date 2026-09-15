/**
 * Final 100% readiness closure — contract tests.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_DELETION_ADMIN_POLICY,
  FINAL_PRODUCT_SURFACE_CONTRACT,
  SETTINGS_PRODUCT_POLICY,
} from "@/domain/product-contract/FinalProductSurfaceContract";
import { reconcileIdentityState } from "@/domain/identity/IdentityReconciliationState";
import {
  assertIdentityWriteAuthorization,
  buildIdentityPersonaPatch,
} from "@/application/controlled-writes/identity/IdentityWritePolicy";
import { FakeIdentityWriteRepository } from "@/application/controlled-writes/identity/IdentityWriteRepository";
import { executeIdentityControlledWrite } from "@/application/controlled-writes/identity/IdentityControlledWriteService";
import { PC9_CONTROLLED_WRITE_INVENTORY } from "@/domain/controlled-writes/Pc9ControlledWriteInventory";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { PHASE_PC10_EXTENDED_LIVE_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { buildDriverComplianceSafeSummary } from "@/domain/driver/DriverComplianceSummary";
import { buildDriverVehicleSafeSummary } from "@/domain/driver/DriverVehicleSafeSummary";
import { NAV_ITEMS } from "@/config/navigation";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Final 100% readiness closure", () => {
  it("product surface contract has zero PARTIAL/SECURITY_BLOCKED", () => {
    const values = Object.values(FINAL_PRODUCT_SURFACE_CONTRACT);
    expect(values.some((v) => String(v).includes("PARTIAL"))).toBe(false);
    expect(values).not.toContain("SECURITY_BLOCKED");
    expect(SETTINGS_PRODUCT_POLICY.classification).toBe(
      "NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT",
    );
    expect(CUSTOMER_DELETION_ADMIN_POLICY.classification).toBe(
      "NOT_APPLICABLE_TO_ADMIN",
    );
  });

  it("identity reconciliation covers required states", () => {
    expect(
      reconcileIdentityState({
        persona: {
          exists: false,
          disabled: false,
          expectedClaims: {},
          roleKey: "none",
          countryId: null,
        },
        auth: null,
      }),
    ).toBe("PERSONA_MISSING");
    expect(
      reconcileIdentityState({
        persona: {
          exists: true,
          disabled: false,
          expectedClaims: { super_admin: true },
          roleKey: "super_admin",
          countryId: null,
        },
        auth: null,
      }),
    ).toBe("CLAIMS_MISSING");
    expect(
      reconcileIdentityState({
        persona: {
          exists: true,
          disabled: false,
          expectedClaims: { super_admin: true },
          roleKey: "super_admin",
          countryId: null,
        },
        auth: {
          exists: true,
          disabled: false,
          claims: { finance: true },
        },
      }),
    ).toBe("ROLE_MISMATCH");
  });

  it("identity write denies self-escalation and last super_admin removal", () => {
    const actor = {
      uid: "u1",
      role: "super_admin" as const,
      permissions: ["users:manage" as const],
      scope: { type: "global" as const },
    };
    const selfDeny = assertIdentityWriteAuthorization({
      actor: { ...actor, uid: "target" },
      command: {
        actor: { ...actor, uid: "target" },
        action: "change_role",
        targetUserId: "target",
        role: "super_admin",
        expectedCurrentRole: "accountant",
        expectedDisabled: false,
        preconditionToken: "t",
        idempotencyKey: "k",
        correlationId: "c",
        reasonCode: "operational",
      },
      snapshot: {
        userId: "target",
        exists: true,
        isPanelPersona: true,
        role: "accountant",
        disabled: false,
        countryId: null,
        agentId: null,
        superAdminCountHint: 2,
        preconditionToken: "t",
        reconciliation: "UNKNOWN",
      },
    });
    expect(selfDeny.ok).toBe(false);

    const lastSa = assertIdentityWriteAuthorization({
      actor,
      command: {
        actor,
        action: "deactivate",
        targetUserId: "sa1",
        expectedCurrentRole: "super_admin",
        expectedDisabled: false,
        preconditionToken: "t",
        idempotencyKey: "k",
        correlationId: "c",
        reasonCode: "operational",
      },
      snapshot: {
        userId: "sa1",
        exists: true,
        isPanelPersona: true,
        role: "super_admin",
        disabled: false,
        countryId: null,
        agentId: null,
        superAdminCountHint: 1,
        preconditionToken: "t",
        reconciliation: "UNKNOWN",
      },
    });
    expect(lastSa.ok).toBe(false);
  });

  it("identity offline fake applies persona patch without setCustomUserClaims", async () => {
    const repo = new FakeIdentityWriteRepository();
    repo.seed({
      userId: "u2",
      exists: true,
      isPanelPersona: true,
      role: "accountant",
      disabled: false,
      countryId: null,
      agentId: null,
      superAdminCountHint: 2,
      preconditionToken: "tok",
      reconciliation: "UNKNOWN",
    });
    const patch = buildIdentityPersonaPatch({
      actor: {
        uid: "admin",
        role: "super_admin",
        permissions: ["users:manage"],
        scope: { type: "global" },
      },
      action: "change_role",
      targetUserId: "u2",
      role: "country_admin",
      countryId: "saudi_arabia",
      expectedCurrentRole: "accountant",
      expectedDisabled: false,
      preconditionToken: "tok",
      idempotencyKey: "idem-1",
      correlationId: "c",
      reasonCode: "operational",
    });
    const result = await executeIdentityControlledWrite(
      {
        actor: {
          uid: "admin",
          role: "super_admin",
          permissions: ["users:manage"],
          scope: { type: "global" },
        },
        action: "change_role",
        targetUserId: "u2",
        role: "country_admin",
        countryId: "saudi_arabia",
        expectedCurrentRole: "accountant",
        expectedDisabled: false,
        preconditionToken: "tok",
        idempotencyKey: "idem-1",
        correlationId: "c",
        reasonCode: "operational",
      },
      {
        flags: {
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          ADMIN_IDENTITY_WRITE_ENABLED: false,
        },
        loadPort: { async load(id) { return repo.get(id) ?? null; } },
        repository: repo,
        idempotency: {
          async get() { return null; },
          async put() {},
        },
        audit: {
          async recordIntent() { return { intentId: "i1" }; },
          async recordResult() { return { resultId: "r1" }; },
        },
        allowOfflineExecution: true,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.claimsDirectSetCustomUserClaims).toBe(false);
    expect(patch.allowlistedFields.length).toBeGreaterThan(0);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
  });

  it("driver documents/vehicle summaries include real schema fields", () => {
    const docs = buildDriverComplianceSafeSummary({
      registration_documents_status: "complete",
      document_review_status: "approved",
      rejection_reason: "blurry",
      needs_changes_reason: "retake",
      doc_national_id: {
        storagePath: "users/x/doc",
        expiryDate: "2099-01-01",
        reviewStatus: "approved",
      },
    });
    expect(docs.documentReviewStatus).toBe("approved");
    expect(docs.rejectionReasonPresent).toBe(true);
    expect(docs.needsChangesReasonPresent).toBe(true);
    expect(docs.slots.find((s) => s.slot === "national_id")?.expiryUtc).toBeTruthy();

    const vehicle = buildDriverVehicleSafeSummary({
      NameCar: "Toyota",
      ModelCar: "Camry",
      number_lohh_car: "ABC1234",
      year_car: 2021,
      color_car: "white",
      vehicle_review_status: "approved",
      normalized_plate: "ABC1234",
    });
    expect(vehicle.year).toBe(2021);
    expect(vehicle.color).toBe("white");
    expect(vehicle.normalizedPlateExposed).toBe(false);
    expect(vehicle.normalizedPlatePresent).toBe(true);
  });

  it("support + notifications collections allowlisted; settings not in nav", () => {
    expect(isCollectionAllowedForProductionRead("support")).toBe(true);
    expect(
      isCollectionAllowedForProductionRead("admin_panel_notifications"),
    ).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/support")).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/notifications")).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/settings")).toBe(false);
    expect(PHASE_PC10_EXTENDED_LIVE_RESOURCES).toContain("support");
    expect(PHASE_PC10_EXTENDED_LIVE_RESOURCES).toContain("notifications");
  });

  it("inventory geography/users/finance are READY_EXISTING gated off", () => {
    const geo = PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "geography");
    const users = PC9_CONTROLLED_WRITE_INVENTORY.find(
      (r) => r.domain === "users_roles",
    );
    const finance = PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "finance");
    expect(geo?.readiness).toBe("READY_EXISTING");
    expect(users?.readiness).toBe("READY_EXISTING");
    expect(finance?.readiness).toBe("READY_EXISTING");
    expect(geo?.productionArmed).toBe(false);
    expect(users?.productionArmed).toBe(false);
  });

  it("docs + harness + identity security artifact exist", () => {
    expect(src("docs/ADMIN_NEXT_IDENTITY_WRITE_SECURITY.md")).toMatch(
      /syncUserClaimsOnWrite/,
    );
    expect(src("docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md")).toMatch(
      /ADMIN_IDENTITY_WRITE_ENABLED/,
    );
    expect(src("docs/ADMIN_NEXT_FINAL_COMPLETION.md")).toMatch(/STRICT 100%/);
    expect(existsSync(join(process.cwd(), "scripts/final-live-validation.mjs"))).toBe(
      true,
    );
    expect(src("scripts/final-live-validation.mjs")).toMatch(
      /final-live-validation\.json/,
    );
    expect(src("scripts/final-live-validation.mjs")).not.toMatch(
      /console\.log\(.*TOKEN/,
    );
  });

  it("write gates remain false defaults", () => {
    expect(src(".env.production.example")).toMatch(
      /ADMIN_IDENTITY_WRITE_ENABLED=false/,
    );
    expect(src(".env.production.example")).toMatch(/GEOGRAPHY_WRITE_ENABLED=false/);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
  });
});

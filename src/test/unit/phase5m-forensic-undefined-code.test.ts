/**
 * Phase 5M forensic regression — exact `code: undefined` Firestore rejection.
 * Offline only. No Production writes.
 */

import { describe, expect, it } from "vitest";
import {
  buildDriverWriteAuditIntent,
  buildDriverWriteAuditResult,
} from "@/application/controlled-writes/drivers/DriverWriteAudit";
import {
  assertFirestoreDocumentHasNoUndefined,
  omitUndefinedDeep,
} from "@/application/controlled-writes/omitUndefinedForFirestore";
import { phase5MFirestoreWritePayload } from "@/application/controlled-writes/pilot/Phase5MProductionWriteAdapters";
import { executeDriverControlledWrite } from "@/application/controlled-writes/drivers/DriverControlledWriteService";
import { createRequestDriverChangesCommand } from "@/application/controlled-writes/drivers/DriverWriteCommands";
import type { DriverWriteAuditPort } from "@/application/controlled-writes/drivers/DriverWriteAudit";
import type { DriverWriteIdempotencyStore } from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import type { DriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import type {
  DriverWriteSnapshot,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";

const ACTOR: VerifiedDriverWriteActor = {
  uid: "super_admin_actor",
  role: "super_admin",
  permissions: [
    "drivers:approve",
    "drivers:read",
    "agents:read",
    "customers:read",
  ],
  scope: { type: "global" },
};

const SNAPSHOT: DriverWriteSnapshot = {
  driverId: "driver_fixture_uid",
  exists: true,
  isOperationalDriver: true,
  registrationStatus: "pending_review",
  accountEnabled: "disabled",
  complianceStatus: "unknown",
  tripState: "idle",
  countryId: "saudi_arabia",
  countryScopeKind: "mapped",
  preconditionToken: "tok_pre",
};

describe("Phase 5M forensic — code:undefined Firestore rejection", () => {
  it("legacy success RESULT object shape had code:undefined (repro)", () => {
    // Exact pre-fix object construction that Production adapter spread into .create()
    const legacySuccessResult = {
      kind: "AUDIT_RESULT" as const,
      auditId: "dwr_repro",
      intentAuditId: "dwi_repro",
      outcome: "applied" as const,
      code: undefined as string | undefined,
      resource: "driver" as const,
      action: "needs_changes" as const,
      driverId: "driver_fixture_uid",
      countryId: "saudi_arabia" as string | null,
      fromState: "pending_review" as const,
      toState: "needs_changes" as const,
      idempotencyKey: "phase5l_driver_needs_changes_pilot_v1",
      correlationId: "phase5l_driver_needs_changes_pilot_v1",
      productionWriteExecuted: false as const,
      createdAtUtc: new Date().toISOString(),
    };
    const legacyPayload = { ...legacySuccessResult, phase: "5M" };
    expect(Object.prototype.hasOwnProperty.call(legacyPayload, "code")).toBe(
      true,
    );
    expect(legacyPayload.code).toBeUndefined();
    expect(() =>
      assertFirestoreDocumentHasNoUndefined(legacyPayload),
    ).toThrow(/found in field "code"/);
  });

  it("buildDriverWriteAuditResult omits code when success (no code arg)", () => {
    const result = buildDriverWriteAuditResult({
      intentAuditId: "dwi_ok",
      outcome: "applied",
      action: "needs_changes",
      driverId: "driver_fixture_uid",
      countryId: "saudi_arabia",
      fromState: "pending_review",
      toState: "needs_changes",
      idempotencyKey: "phase5l_driver_needs_changes_pilot_v1",
      correlationId: "phase5l_driver_needs_changes_pilot_v1",
    });
    expect(Object.prototype.hasOwnProperty.call(result, "code")).toBe(false);
    expect(result.code).toBeUndefined();
  });

  it("buildDriverWriteAuditResult keeps code when failure", () => {
    const result = buildDriverWriteAuditResult({
      intentAuditId: "dwi_fail",
      outcome: "failed",
      code: "INTERNAL_WRITE_FAILURE",
      action: "needs_changes",
      driverId: "driver_fixture_uid",
      countryId: "saudi_arabia",
      fromState: "pending_review",
      toState: "needs_changes",
      idempotencyKey: "k",
      correlationId: "c",
    });
    expect(result.code).toBe("INTERNAL_WRITE_FAILURE");
  });

  it("buildDriverWriteAuditIntent omits reasonCode when undefined", () => {
    const intent = buildDriverWriteAuditIntent({
      actorUid: ACTOR.uid,
      actorRole: ACTOR.role,
      action: "approve",
      driverId: "d",
      countryId: "saudi_arabia",
      countryScopeKind: "mapped",
      fromState: "pending_review",
      toState: "approved",
      idempotencyKey: "idempotency_key_ok",
      correlationId: "corr",
    });
    expect(Object.prototype.hasOwnProperty.call(intent, "reasonCode")).toBe(
      false,
    );
  });

  it("phase5MFirestoreWritePayload strips code:undefined (adapter defense)", () => {
    const raw = {
      kind: "AUDIT_RESULT",
      outcome: "applied",
      code: undefined,
      phase: "5M",
    };
    const payload = phase5MFirestoreWritePayload(raw);
    expect(Object.prototype.hasOwnProperty.call(payload, "code")).toBe(false);
    expect(() => assertFirestoreDocumentHasNoUndefined(payload)).not.toThrow();
  });

  it("omitUndefinedDeep strips nested undefined under idempotency result", () => {
    const nested = omitUndefinedDeep({
      key: "k",
      result: { ok: true, auditResultId: "", previousResult: undefined },
      phase: "5M",
    }) as Record<string, unknown>;
    const result = nested.result as Record<string, unknown>;
    expect(
      Object.prototype.hasOwnProperty.call(result, "previousResult"),
    ).toBe(false);
    expect(() => assertFirestoreDocumentHasNoUndefined(nested)).not.toThrow();
  });

  it("executeDriverControlledWrite success path survives Firestore-strict audit port", async () => {
    const created: Record<string, unknown>[] = [];
    const audit: DriverWriteAuditPort = {
      async recordIntent(intent) {
        const payload = phase5MFirestoreWritePayload({
          ...intent,
          phase: "5M",
        });
        assertFirestoreDocumentHasNoUndefined(payload);
        created.push(payload);
      },
      async recordResult(result) {
        const payload = phase5MFirestoreWritePayload({
          ...result,
          phase: "5M",
        });
        assertFirestoreDocumentHasNoUndefined(payload);
        created.push(payload);
      },
    };
    const idempotency: DriverWriteIdempotencyStore = {
      async get() {
        return null;
      },
      async put(record) {
        assertFirestoreDocumentHasNoUndefined(
          phase5MFirestoreWritePayload({ ...record, phase: "5M" }),
        );
      },
    };
    const loadPort: DriverWriteLoadPort = {
      async loadForWrite() {
        return { ...SNAPSHOT };
      },
    };
    const repository: DriverWriteRepository = {
      kind: "fake_driver_write",
      async apply(input) {
        return {
          driverId: input.command.driverId,
          fromState: input.fromState,
          toState: input.toState,
          preconditionTokenAfter: "tok_after",
          appliedAtUtc: new Date().toISOString(),
        };
      },
    };

    const command = createRequestDriverChangesCommand({
      actor: ACTOR,
      driverId: SNAPSHOT.driverId,
      expectedCurrentState: "pending_review",
      preconditionToken: SNAPSHOT.preconditionToken,
      idempotencyKey: "phase5l_driver_needs_changes_pilot_v1",
      correlationId: "phase5l_driver_needs_changes_pilot_v1",
      reasonCode: "missing_document",
    });

    const outcome = await executeDriverControlledWrite(command, {
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
      },
      loadPort,
      repository,
      idempotency,
      audit,
      allowOfflineExecution: true,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.status).toBe("applied");
    }
    const successResult = created.find(
      (d) => d.kind === "AUDIT_RESULT" && d.outcome === "applied",
    );
    expect(successResult).toBeTruthy();
    expect(
      Object.prototype.hasOwnProperty.call(successResult ?? {}, "code"),
    ).toBe(false);
  });
});

/**
 * FR3 Reconciliation pilot preparation — offline unit tests.
 * Read-only by design. Production writes = 0.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  assertFinanceFr3ReconDeterministic,
  reconcileFinanceFr3SnapshotToSettlement,
} from "@/application/finance/pilot/FinanceFr3PilotCalculator";
import { prepareFinanceFr3ReconciliationPilot } from "@/application/finance/pilot/FinanceFr3PilotPreparation";
import {
  FINANCE_FR3_EXPECTED_WRITE_COUNTS,
  FINANCE_FR3_PERSISTENCE_MODE,
  FINANCE_FR3_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import {
  FINANCE_FR3_LOCKED_RECON_EXPECTATIONS,
  FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE,
  FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
} from "@/application/finance/pilot/FinanceFr3PilotDocuments";
import {
  evaluateFinanceFr3LiveVerifyGates,
  isFinanceFr3ReconPilotVerifyEnabled,
} from "@/application/finance/pilot/FinanceFr3PilotGates";
import {
  FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
} from "@/application/finance/pilot/FinanceFr3PilotIamDerivation";
import {
  buildFinanceFr1PilotIdempotencyDoc,
} from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import {
  buildFinanceFr2PilotIdempotencyDoc,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";

const FR1_IDEM = buildFinanceFr1PilotIdempotencyDoc({
  actorUid: "u1",
  correlationId: "c1",
  auditIntentId: "ai1",
  auditResultId: "ar1",
  createdAtUtc: "2026-09-13T21:00:00.000Z",
}) as unknown as Record<string, unknown>;

const FR2_IDEM = buildFinanceFr2PilotIdempotencyDoc({
  actorUid: "u1",
  correlationId: "c1",
  auditIntentId: "ai2",
  auditResultId: "ar2",
  createdAtUtc: "2026-09-13T22:00:00.000Z",
}) as unknown as Record<string, unknown>;

function recon(input: {
  snapshot?: typeof FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE | null;
  settlement?: typeof FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE | null;
  fr1Idempotency?: Record<string, unknown> | null;
  fr2Idempotency?: Record<string, unknown> | null;
  permissions?: ("finance:read" | "settlements:prepare")[];
}) {
  return reconcileFinanceFr3SnapshotToSettlement({
    snapshot:
      input.snapshot === undefined
        ? FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE
        : input.snapshot,
    settlement:
      input.settlement === undefined
        ? FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE
        : input.settlement,
    fr1Idempotency:
      input.fr1Idempotency === undefined ? FR1_IDEM : input.fr1Idempotency,
    fr2Idempotency:
      input.fr2Idempotency === undefined ? FR2_IDEM : input.fr2Idempotency,
    actorUserId: "u1",
    actorPermissions: input.permissions ?? ["finance:read"],
  });
}

describe("Finance FR3 Reconciliation pilot preparation (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false and Production writes = 0", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prep = prepareFinanceFr3ReconciliationPilot();
    expect(prep.financeWriteEnabled).toBe(false);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.persistenceMode).toBe("read_only_shadow");
    expect(prep.writeHarnessRequired).toBe(false);
    expect(prep.fr3PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
  });

  it("locks exact reconciliation result for current synthetic settlement", () => {
    const prep = prepareFinanceFr3ReconciliationPilot();
    const r = prep.reconciliation!;
    expect(r.snapshotMatchesSettlement).toBe(true);
    expect(r.currencyMatches).toBe(true);
    expect(r.directionMatches).toBe(true);
    expect(r.claimMatchesCommission).toBe(true);
    expect(r.paidConfirmedMinor).toBe("0");
    expect(r.outstandingMinor).toBe("1500");
    expect(r.reconciliationStatus).toBe("PASS");
    expect(r.reconciliationBlockers).toEqual([]);
    expect(r.sourceIntegrityPass).toBe(true);
    expect(r.idempotencyIntegrityPass).toBe(true);
    expect(r.dimensions.fr1PlatformCommissionMinor).toBe("1500");
    expect(r.dimensions.fr2ClaimAmountMinor).toBe("1500");
    expect(r.dimensions.settlementDirection).toBe("DRIVER_PAYS_COMPANY");
    expect(r.dimensions.currency).toBe("SAR");
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR3_EXPECTED_WRITE_COUNTS);
    expect(prep.exactExpectedWrites.totalProductionWrites).toBe(0);
    expect(prep.lockedReconExpectations).toEqual(
      FINANCE_FR3_LOCKED_RECON_EXPECTATIONS,
    );
    expect(prep.requiredIamPermissionsForWrites).toEqual(
      FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
    );
    expect(prep.requiredIamPermissionsForLiveReadVerify).toEqual(
      FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    );
  });

  it("prep refuses live verify; write harness not required", () => {
    expect(isFinanceFr3ReconPilotVerifyEnabled(undefined)).toBe(false);
    const gates = evaluateFinanceFr3LiveVerifyGates({
      env: process.env,
      mode: "preparation",
    });
    expect(gates.allowed).toBe(false);
    expect(gates.expectedWrites).toEqual(FINANCE_FR3_ZERO_WRITE_COUNTS);
    expect(gates.persistenceMode).toBe(FINANCE_FR3_PERSISTENCE_MODE);
  });
});

describe("Finance FR3 Reconciliation calculator cases", () => {
  it("exact-match case → PASS", () => {
    const r = recon({});
    expect(r.reconciliationStatus).toBe("PASS");
    expect(r.snapshotMatchesSettlement).toBe(true);
    expect(r.outstandingMinor).toBe("1500");
    expect(r.productionWrites).toBe(0);
    expect(r.shadowOnly).toBe(true);
  });

  it("amount mismatch → NO-GO", () => {
    const settlement = {
      ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
      amountMinor: 9999,
      claims: [
        {
          ...(FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE.claims as Array<
            Record<string, unknown>
          >)[0],
          amountMinor: 9999,
        },
      ],
    };
    const r = recon({ settlement });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(r.claimMatchesCommission).toBe(false);
    expect(
      r.reconciliationBlockers.some((b) => b.includes("claim_commission_mismatch")),
    ).toBe(true);
  });

  it("currency mismatch → NO-GO", () => {
    const r = recon({
      settlement: {
        ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
        currency: "AED",
      },
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(r.currencyMatches).toBe(false);
    expect(
      r.reconciliationBlockers.some((b) => b.includes("currency")),
    ).toBe(true);
  });

  it("source mismatch → NO-GO", () => {
    const r = recon({
      settlement: {
        ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
        sourceAccountingSnapshotId: "wrong_snapshot_id",
      },
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(
      r.reconciliationBlockers.some((b) => b.includes("source_snapshot_mismatch")),
    ).toBe(true);
  });

  it("paid > claim → NO-GO", () => {
    const r = recon({
      settlement: {
        ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
        paidConfirmedMinor: 2000,
      },
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(
      r.reconciliationBlockers.some((b) => b.includes("paid_exceeds_claim")),
    ).toBe(true);
  });

  it("missing values → NO-GO (missing ≠ 0)", () => {
    const snapshot = {
      ...FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE,
      commissionAmountPersistedMinor: null,
    };
    const r = recon({ snapshot, fr1Idempotency: undefined });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(
      r.reconciliationBlockers.some(
        (b) => b === "missing:fr1_commissionAmountPersistedMinor",
      ),
    ).toBe(true);
    // Must not invent commission=0
    expect(r.dimensions.fr1PlatformCommissionMinor).toBeNull();
  });

  it("duplicate reconciliation is deterministic", () => {
    const a = recon({});
    const b = recon({});
    expect(assertFinanceFr3ReconDeterministic(a, b)).toEqual([]);
    expect(a.reconciliationStatus).toBe(b.reconciliationStatus);
    expect(a.outstandingMinor).toBe(b.outstandingMinor);
    expect(a.idempotencyKeyPattern).toBe(b.idempotencyKeyPattern);
  });

  it("cross-country isolation → NO-GO", () => {
    const r = recon({
      settlement: {
        ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
        countryId: "united_arab_emirates",
      },
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(
      r.reconciliationBlockers.some(
        (b) =>
          b.includes("cross_country_fail_closed") ||
          b.includes("settlement_country"),
      ),
    ).toBe(true);
  });

  it("RBAC denial → NO-GO", () => {
    const r = recon({ permissions: [] as never[] });
    expect(r.rbacDenied).toBe(true);
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(r.reconciliationBlockers).toContain("rbac_denied:finance:read");
  });

  it("immutable snapshot enforcement → NO-GO", () => {
    const r = recon({
      snapshot: {
        ...FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE,
        historicalReRateForbidden: false,
        mutatesOrderMajors: true,
      },
      fr1Idempotency: undefined,
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(r.reconciliationBlockers).toContain("snapshot_mutates_order_majors");
    expect(r.reconciliationBlockers).toContain(
      "historical_snapshot_not_immutable",
    );
  });

  it("does not rewrite settlement to pass — settlement rewrite flag → NO-GO", () => {
    const r = recon({
      settlement: {
        ...FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
        mutatesFinanceSnapshot: true,
      },
      fr2Idempotency: undefined,
    });
    expect(r.reconciliationStatus).toBe("NO-GO");
    expect(r.reconciliationBlockers).toContain(
      "settlement_mutates_finance_snapshot",
    );
  });
});

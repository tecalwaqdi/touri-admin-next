/**
 * Settlement V2 commercial cutover — certified-only accountant path.
 * Legacy orphans isolated; QA excluded; first commercial snap auto-eligible.
 */
import { describe, expect, it } from "vitest";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  classifySettlementCommercialEligibility,
  countUnsettledCertifiedCommercialSnapshots,
  listCertifiedCommercialSnapshots,
  NO_CERTIFIED_SETTLEMENTS_AR,
  partitionSettlementsForCommercialCutover,
} from "@/domain/finance/reporting/SettlementCommercialCutover";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { FINANCE_FR2_COUNTRY_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";

const ACCOUNTANT: FinanceReportingActor = {
  userId: "acct",
  role: "accountant",
  permissions: ["finance:read", "reports:export"],
  scope: { type: "global" },
};

const SUPER: FinanceReportingActor = {
  ...ACCOUNTANT,
  role: "super_admin",
};

function commercialBundle(): FinanceReportingSourceBundle {
  const base = buildFinanceFr7GoldenSourceBundle();
  return {
    ...base,
    snapshots: [
      {
        id: "snap_commercial_sa_001",
        orderId: "order_commercial_sa_001",
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        paymentMethod: "cash",
        grossFareMinor: 10000n,
        eligibleRevenueMinor: 10000n,
        commissionAmountPersistedMinor: 1500n,
        vatAmountMinor: 0n,
        driverDeductionsMinor: 1500n,
        driverNetMinor: 8500n,
        gatewayFeeMinor: 0n,
        driverId: "drv_commercial_001",
        agentId: null,
        agentShareMinor: null,
        agentAttributionStatus: "missing",
        lifecycleCompleted: true,
        createdAtUtc: "2026-09-20T10:00:00.000Z",
        commissionRatePercent: 15,
      },
    ],
    settlements: [
      {
        id: "fin_set_commercial_001",
        partyType: "driver",
        partyId: "drv_commercial_001",
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        status: "locked",
        direction: "DRIVER_PAYS_COMPANY",
        amountMinor: 1500n,
        paidConfirmedMinor: 0n,
        periodFromUtc: "2026-09-20T00:00:00.000Z",
        periodToUtc: "2026-09-20T23:59:59.999Z",
        sourceAccountingSnapshotId: "snap_commercial_sa_001",
        sourceOrderId: "order_commercial_sa_001",
        claims: [
          {
            lineId: "claim_commercial_001",
            orderId: "order_commercial_sa_001",
            amountMinor: 1500n,
            currency: "SAR",
          },
        ],
        updatedAtUtc: "2026-09-20T10:05:00.000Z",
      },
      {
        id: "fin_set_orphan_legacy",
        partyType: "driver",
        partyId: "drv_old",
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        status: "outstanding",
        direction: "DRIVER_PAYS_COMPANY",
        amountMinor: 9999n,
        paidConfirmedMinor: 0n,
        periodFromUtc: null,
        periodToUtc: null,
        sourceAccountingSnapshotId: null,
        sourceOrderId: null,
        claims: [],
        updatedAtUtc: "2025-01-01T00:00:00.000Z",
      },
    ],
    payments: [],
    adjustments: [],
    refunds: [],
    chargebacks: [],
    payouts: [],
  };
}

describe("Settlement V2 commercial cutover", () => {
  it("classifies certified vs legacy orphan vs QA", () => {
    const bundle = commercialBundle();
    const part = partitionSettlementsForCommercialCutover({
      settlements: bundle.settlements,
      snapshots: bundle.snapshots,
    });
    expect(part.commercial.map((s) => s.id)).toEqual([
      "fin_set_commercial_001",
    ]);
    expect(part.legacyOrphan.map((s) => s.id)).toEqual([
      "fin_set_orphan_legacy",
    ]);
    const qa = classifySettlementCommercialEligibility({
      settlement: {
        ...bundle.settlements[0]!,
        id: "test_adminnext_finance_fr2_settlement_001",
      },
      snapshotsById: new Map(bundle.snapshots.map((s) => [s.id, s])),
    });
    expect(qa.class).toBe("qa_pilot");
  });

  it("accountant commercial list / totals / recon are certified-only", () => {
    const svc = new FinanceReportingReadService(commercialBundle());
    const rows = svc.settlements(ACCOUNTANT, { includePilotRecords: false });
    expect(rows.map((r) => r.id)).toEqual(["fin_set_commercial_001"]);
    const dash = svc.dashboard(ACCOUNTANT, { includePilotRecords: false });
    expect(dash.settlementCount).toBe(1);
    expect(dash.company.outstanding.amountMinor).toBe("1500");
    expect(dash.orphanLegacySettlementCount).toBe(1);
    expect(dash.certifiedCommercialSnapshotCount).toBe(1);
    const recon = svc.reconciliation(ACCOUNTANT, {
      includePilotRecords: false,
    });
    expect(
      recon.blockers.some((b) => b.includes("fin_set_orphan_legacy")),
    ).toBe(false);
  });

  it("includeLegacy=true is super_admin only; accountant denied", () => {
    const svc = new FinanceReportingReadService(commercialBundle());
    expect(() =>
      svc.reconciliation(ACCOUNTANT, {
        includePilotRecords: false,
        includeLegacy: true,
      }),
    ).toThrow(/includeLegacy_requires_super_admin/);
    const withLegacy = svc.reconciliation(SUPER, {
      includePilotRecords: false,
      includeLegacy: true,
    });
    expect(
      withLegacy.blockers.some((b) => b.includes("fin_set_orphan_legacy")),
    ).toBe(true);
  });

  it("hides legacy detail from accountant; super_admin read-only", () => {
    const svc = new FinanceReportingReadService(commercialBundle());
    expect(svc.settlement(ACCOUNTANT, "fin_set_orphan_legacy")).toBeNull();
    const detail = svc.settlement(SUPER, "fin_set_orphan_legacy");
    expect(detail?.readOnly).toBe(true);
    expect(detail?.commercialClass).toBe("legacy_orphan");
  });

  it("first commercial certified snapshot is auto-eligible for discovery counters", () => {
    const unsettledOnly: FinanceReportingSourceBundle = {
      ...commercialBundle(),
      settlements: [],
    };
    const certified = listCertifiedCommercialSnapshots(unsettledOnly.snapshots);
    expect(certified).toHaveLength(1);
    expect(
      countUnsettledCertifiedCommercialSnapshots({
        snapshots: unsettledOnly.snapshots,
        settlements: [],
      }),
    ).toBe(1);
    const svc = new FinanceReportingReadService(unsettledOnly);
    const dash = svc.dashboard(ACCOUNTANT, { includePilotRecords: false });
    expect(dash.unsettledCertifiedCommercialSnapshotCount).toBe(1);
    expect(dash.certifiedCommercialSnapshotCount).toBe(1);
  });

  it("QA golden settlements excluded from commercial default", () => {
    const svc = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle(),
    );
    expect(
      svc.settlements(ACCOUNTANT, { includePilotRecords: false }),
    ).toHaveLength(0);
    expect(
      svc.settlements(ACCOUNTANT, { includePilotRecords: true }).length,
    ).toBeGreaterThan(0);
  });

  it("accountant empty-state AR copy is certified-settlements wording", () => {
    expect(presentFinanceTerm("noCertifiedSettlements", "ar")).toBe(
      NO_CERTIFIED_SETTLEMENTS_AR,
    );
  });
});

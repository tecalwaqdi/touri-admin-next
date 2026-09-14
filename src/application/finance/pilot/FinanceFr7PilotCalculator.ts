/**
 * FR7 Reporting pilot — golden verify calculator (offline + live docs).
 * Position = snapshot + approved monetary adj + settlement/payment history.
 * FR6 neutral_memo → monetary impact 0.
 */

import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
import {
  FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
  FINANCE_FR7_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import {
  FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT,
  mapProductionDocsToFr7Bundle,
  buildFinanceFr7GoldenSourceBundle,
} from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { adjustmentHasMonetaryEffect } from "@/domain/finance/reporting/FinanceAdjustmentMonetarySemantics";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr7GoldenVerifyResult = {
  productionWrites: 0;
  writeCounts: typeof FINANCE_FR7_ZERO_WRITE_COUNTS;
  persistenceMode: "read_only_computed_models";
  currency: string | null;
  grossFareMinor: string | null;
  companyCommissionMinor: string | null;
  driverNetMinor: string | null;
  settlementAmountMinor: string | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  settlementStatus: string | null;
  settlementDirection: string | null;
  reconciliationStatus: "PASS" | "WARN" | "FAIL" | "UNKNOWN" | null;
  fr6AdjustmentMonetaryEffect: boolean;
  fr6SignedCompanyClaimImpactMinor: string | null;
  fr6AmountPersistedMinor: string | null;
  monetaryTotalsUnchangedByMemo: boolean;
  goldenMatch: boolean;
  blockers: string[];
  reportingStatus: "PASS" | "NO-GO";
};

function defaultActor(
  permissions: FinancePermission[] = ["finance:read", "reports:export"],
): FinanceReportingActor {
  return {
    userId: "fr7_verify_actor",
    role: "accountant",
    permissions,
    scope: { type: "global" },
  };
}

export function verifyFinanceFr7GoldenReporting(input?: {
  snapshot?: Record<string, unknown> | null;
  settlement?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  adjustment?: Record<string, unknown> | null;
  actorPermissions?: FinancePermission[];
  useOfflineFixture?: boolean;
}): FinanceFr7GoldenVerifyResult {
  const blockers: string[] = [];
  const permissions = input?.actorPermissions ?? [
    "finance:read",
    "reports:export",
  ];
  if (!permissions.includes("finance:read")) {
    blockers.push("rbac_denied:finance:read");
  }

  const bundle =
    input?.useOfflineFixture !== false &&
    !input?.snapshot &&
    !input?.settlement
      ? buildFinanceFr7GoldenSourceBundle()
      : mapProductionDocsToFr7Bundle({
          snapshot: input?.snapshot ?? null,
          settlement: input?.settlement ?? null,
          payment: input?.payment ?? null,
          adjustment: input?.adjustment ?? null,
        });

  if (!permissions.includes("finance:read")) {
    return {
      productionWrites: 0,
      writeCounts: FINANCE_FR7_ZERO_WRITE_COUNTS,
      persistenceMode: "read_only_computed_models",
      currency: null,
      grossFareMinor: null,
      companyCommissionMinor: null,
      driverNetMinor: null,
      settlementAmountMinor: null,
      paidConfirmedMinor: null,
      outstandingMinor: null,
      settlementStatus: null,
      settlementDirection: null,
      reconciliationStatus: "UNKNOWN",
      fr6AdjustmentMonetaryEffect: false,
      fr6SignedCompanyClaimImpactMinor: null,
      fr6AmountPersistedMinor: null,
      monetaryTotalsUnchangedByMemo: false,
      goldenMatch: false,
      blockers,
      reportingStatus: "NO-GO",
    };
  }

  const svc = new FinanceReportingReadService(bundle);
  const actor = defaultActor(permissions);
  const dash = svc.dashboard(actor);
  const settlements = svc.settlements(actor);
  const recon = svc.reconciliation(actor);
  const corrections = svc.corrections(actor);
  const sett = settlements[0] ?? null;
  const adj = corrections.find((c) => c.kind === "adjustment") ?? null;

  const gross = dash.company.grossBookingValue.amountMinor;
  const commission = dash.company.platformCommission.amountMinor;
  const driver = svc.driverSummary(
    actor,
    bundle.snapshots[0]?.driverId ?? "missing",
  );

  const detail = sett ? svc.settlement(actor, sett.id) : null;
  const detailAdj = detail?.approvedAdjustments[0];
  const signedImpact =
    detailAdj?.signedCompanyClaimImpactMinor ??
    (adj && !adjustmentHasMonetaryEffect(adj.directionOrKind)
      ? "0"
      : adj
        ? null
        : FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT.signedCompanyClaimImpactMinor);

  const g = FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS;
  const goldenMatch =
    dash.meta.currency === g.currency &&
    gross === g.grossFareMinor &&
    commission === g.companyCommissionMinor &&
    driver.metrics.driverNet.amountMinor === g.driverNetMinor &&
    sett?.amountMinor === g.settlementAmountMinor &&
    sett?.paidConfirmedMinor === g.paidConfirmedMinor &&
    sett?.outstandingMinor === g.outstandingMinor &&
    sett?.status === g.settlementStatus &&
    sett?.direction === g.settlementDirection &&
    recon.status === g.reconciliationStatus &&
    signedImpact === "0" &&
    (detailAdj ? detailAdj.monetaryEffect === false : true);

  if (!goldenMatch) {
    if (gross !== g.grossFareMinor) blockers.push("gross_mismatch");
    if (commission !== g.companyCommissionMinor) {
      blockers.push("commission_mismatch");
    }
    if (driver.metrics.driverNet.amountMinor !== g.driverNetMinor) {
      blockers.push("driver_net_mismatch");
    }
    if (sett?.outstandingMinor !== g.outstandingMinor) {
      blockers.push("outstanding_mismatch");
    }
    if (recon.status !== g.reconciliationStatus) {
      blockers.push("recon_not_pass");
    }
    if (signedImpact !== "0") blockers.push("fr6_memo_altered_money");
  }

  const monetaryTotalsUnchangedByMemo =
    signedImpact === "0" &&
    (!detailAdj || detailAdj.monetaryEffect === false);

  return {
    productionWrites: 0,
    writeCounts: FINANCE_FR7_ZERO_WRITE_COUNTS,
    persistenceMode: "read_only_computed_models",
    currency: dash.meta.currency,
    grossFareMinor: gross,
    companyCommissionMinor: commission,
    driverNetMinor: driver.metrics.driverNet.amountMinor,
    settlementAmountMinor: sett?.amountMinor ?? null,
    paidConfirmedMinor: sett?.paidConfirmedMinor ?? null,
    outstandingMinor: sett?.outstandingMinor ?? null,
    settlementStatus: sett?.status ?? null,
    settlementDirection: sett?.direction ?? null,
    reconciliationStatus: recon.status,
    fr6AdjustmentMonetaryEffect: detailAdj
      ? detailAdj.monetaryEffect
      : adj
        ? adjustmentHasMonetaryEffect(adj.directionOrKind)
        : false,
    fr6SignedCompanyClaimImpactMinor: signedImpact,
    fr6AmountPersistedMinor: adj?.amountMinor ?? null,
    monetaryTotalsUnchangedByMemo,
    goldenMatch,
    blockers,
    reportingStatus: goldenMatch && blockers.length === 0 ? "PASS" : "NO-GO",
  };
}

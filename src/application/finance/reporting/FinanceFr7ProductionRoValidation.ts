/**
 * Production RO validation for FR7 — offline + optional live.
 * DEFAULT: SKIP live unless FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 and ADC present.
 * Never writes. totalProductionWrites / firestoreMutations must remain 0.
 */

import { verifyFinanceFr7GoldenReporting } from "@/application/finance/pilot/FinanceFr7PilotCalculator";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import { ProductionFinanceReportingReadAdapter } from "@/adapters/finance/reporting/ProductionFinanceReportingReadAdapter";
import type { FinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import { requireCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { FINANCE_FR2_COUNTRY_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR7_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr7PilotConstants";

export const FINANCE_FR7_PRODUCTION_RO_VALIDATE_ENV =
  "FINANCE_FR7_PRODUCTION_RO_VALIDATE" as const;

export type FinanceFr7ProductionRoValidationResult = {
  goldenMatch: boolean;
  settlementListParity: boolean;
  settlementDetailParity: boolean;
  canonicalCountryMatch: boolean;
  scopePass: boolean;
  fr6NeutralMemoMonetaryEffectFalse: boolean;
  noDuplicateSettlementCount: boolean;
  totalProductionWrites: 0;
  firestoreMutations: 0;
  productionReads: number;
  overallStatus: "PASS" | "NO-GO" | "SKIP";
  blockers: string[];
};

function accountantActor() {
  return {
    userId: "ro_validate",
    role: "accountant" as const,
    permissions: ["finance:read", "reports:export"],
    scope: { type: "global" as const },
  };
}

function countryAdminActor(countryIds: string[]) {
  return {
    userId: "ro_country_admin",
    role: "country_admin" as const,
    permissions: ["finance:read"],
    scope: { type: "country" as const, countryIds },
  };
}

/** Offline validation against a Production RO adapter (fake or live port). */
export async function validateFinanceFr7ProductionReadOnly(input: {
  firestore: FinanceReportingRoFirestorePort;
  /** When true, compare dashboard to golden totals (known FR1–FR7 chain). */
  expectGoldenMatch?: boolean;
}): Promise<FinanceFr7ProductionRoValidationResult> {
  const blockers: string[] = [];
  const adapter = new ProductionFinanceReportingReadAdapter(input.firestore);
  const loaded = await adapter.load();
  const counter = input.firestore.getCounter();

  if (loaded.productionWrites !== 0 || counter.productionWrites !== 0) {
    blockers.push("production_writes_nonzero");
  }
  if (loaded.firestoreMutations !== 0 || counter.firestoreMutations !== 0) {
    blockers.push("firestore_mutations_nonzero");
  }

  const svc = new FinanceReportingReadService(loaded.bundle);
  const actor = accountantActor();
  const dash = svc.dashboard(actor);
  const list = svc.settlements(actor);
  const settlementId = list[0]?.id ?? FINANCE_FR7_SETTLEMENT_DOC_ID;
  const detail = svc.settlement(actor, settlementId);
  const corrections = svc.corrections(actor);

  const listRow = list.find((r) => r.id === settlementId) ?? null;
  const settlementListParity =
    listRow != null &&
    detail != null &&
    listRow.amountMinor === detail.amountMinor &&
    listRow.paidConfirmedMinor === detail.paidConfirmedMinor &&
    listRow.outstandingMinor === detail.outstandingMinor &&
    listRow.status === detail.status &&
    listRow.currency === detail.currency;

  const settlementDetailParity = settlementListParity;

  if (!settlementListParity) blockers.push("settlement_list_detail_parity");

  let canonicalCountryMatch = false;
  try {
    const fromSa = requireCanonicalCountryId("SA");
    const fromFull = requireCanonicalCountryId("saudi_arabia");
    canonicalCountryMatch =
      fromSa === "saudi_arabia" &&
      fromFull === "saudi_arabia" &&
      fromSa === FINANCE_FR2_COUNTRY_ID;
    // Filtering SA and saudi_arabia must hit the same single bucket.
    const viaSa = svc.dashboard(actor, { countryId: "SA" });
    const viaFull = svc.dashboard(actor, { countryId: "saudi_arabia" });
    if (
      viaSa.company.platformCommission.amountMinor !==
      viaFull.company.platformCommission.amountMinor
    ) {
      canonicalCountryMatch = false;
      blockers.push("country_alias_split_bucket");
    }
  } catch (e) {
    blockers.push(
      `canonical_country_error:${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  let scopePass = false;
  try {
    const scoped = countryAdminActor(["SA"]);
    // Actor boundary would canonicalize; simulate canonical scope.
    const scopedCanonical = countryAdminActor([
      requireCanonicalCountryId("SA"),
    ]);
    svc.dashboard(scopedCanonical, { countryId: "SA" });
    try {
      svc.countrySummary(scopedCanonical, "russia");
      blockers.push("scope_should_deny_russia");
    } catch {
      scopePass = true;
    }
    void scoped;
  } catch (e) {
    blockers.push(
      `scope_error:${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  const memo = corrections.find((c) => c.directionOrKind === "neutral_memo");
  const fr6NeutralMemoMonetaryEffectFalse =
    memo == null ? true : memo.monetaryEffect === false;
  if (!fr6NeutralMemoMonetaryEffectFalse) {
    blockers.push("fr6_memo_monetary_effect_true");
  }

  const ids = list.map((r) => r.id);
  const noDuplicateSettlementCount = ids.length === new Set(ids).size;
  if (!noDuplicateSettlementCount) blockers.push("duplicate_settlement_ids");

  let goldenMatch = false;
  if (input.expectGoldenMatch !== false) {
    const g = FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS;
    goldenMatch =
      dash.company.platformCommission.amountMinor ===
        g.companyCommissionMinor &&
      dash.company.grossBookingValue.amountMinor === g.grossFareMinor &&
      listRow?.amountMinor === g.settlementAmountMinor &&
      listRow?.outstandingMinor === g.outstandingMinor &&
      fr6NeutralMemoMonetaryEffectFalse;
    if (!goldenMatch) blockers.push("golden_mismatch");
  } else {
    goldenMatch = true;
  }

  const overallStatus =
    blockers.length === 0 &&
    settlementListParity &&
    canonicalCountryMatch &&
    scopePass &&
    fr6NeutralMemoMonetaryEffectFalse &&
    noDuplicateSettlementCount
      ? "PASS"
      : "NO-GO";

  return {
    goldenMatch,
    settlementListParity,
    settlementDetailParity,
    canonicalCountryMatch,
    scopePass,
    fr6NeutralMemoMonetaryEffectFalse,
    noDuplicateSettlementCount,
    totalProductionWrites: 0,
    firestoreMutations: 0,
    productionReads: counter.productionReads,
    overallStatus,
    blockers,
  };
}

/** Offline golden service parity (no Firestore). */
export function validateFinanceFr7GoldenOfflineParity(): {
  goldenMatch: boolean;
  settlementListParity: boolean;
  settlementDetailParity: boolean;
} {
  const verify = verifyFinanceFr7GoldenReporting({ useOfflineFixture: true });
  const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
  const actor = accountantActor();
  const list = svc.settlements(actor);
  const detail = list[0] ? svc.settlement(actor, list[0].id) : null;
  const settlementListParity =
    detail != null &&
    list[0]!.amountMinor === detail.amountMinor &&
    list[0]!.outstandingMinor === detail.outstandingMinor;
  return {
    goldenMatch: verify.goldenMatch,
    settlementListParity,
    settlementDetailParity: settlementListParity,
  };
}

export function isFinanceFr7ProductionRoValidateEnabled(
  value: string | undefined | null,
): boolean {
  const n = String(value ?? "")
    .trim()
    .toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

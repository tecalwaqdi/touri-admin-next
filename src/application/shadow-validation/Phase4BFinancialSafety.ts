/**
 * Phase 4B — financial safety validation (read semantics only).
 * Does NOT implement Finance / Settlement.
 * Distinguishes stored total_app / total_vat / total_mndob from rates.
 * Missing rates → not_represented (NOT zero). Settlement remains blocked.
 */

import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import { assertIncompleteNotZero } from "@/domain/canonical/FieldProvenance";

export type FinancialSafetyResult = {
  financialConflicts: number;
  financialMissingAsZero: number;
  settlementBlocked: boolean;
  accountingApprovedCount: number;
  reasons: string[];
};

function knowledgeIsMissingOrNotRepresented(k: string | null | undefined): boolean {
  if (!k) return true;
  return (
    k === "not_represented" ||
    k === "missing" ||
    k === "unknown" ||
    k === "conflicting"
  );
}

/**
 * Validate trip financial safe-read fields without inventing settlement.
 */
export function validateTripFinancialSafety(
  trips: CanonicalTripReadModel[],
): FinancialSafetyResult {
  let financialConflicts = 0;
  let financialMissingAsZero = 0;
  let accountingApprovedCount = 0;
  const reasons: string[] = [];

  for (const trip of trips) {
    const fin = trip.financialSafeRead;

    if (fin.isAccountingApproved !== false) {
      accountingApprovedCount += 1;
      reasons.push(`trip:${trip.sourceDocumentId}:accounting_approved`);
    }
    if (fin.isSettlementSafe !== false) {
      reasons.push(`trip:${trip.sourceDocumentId}:settlement_safe_true`);
      financialConflicts += 1;
    }

    // Rates must not be coerced to 0 when not_represented / missing.
    const rateChecks: Array<[string, number | null, string]> = [
      ["vatRatePercent", fin.vatRatePercent, fin.vatRateKnowledge],
      [
        "platformCommissionRatePercent",
        fin.platformCommissionRatePercent,
        fin.platformCommissionRateKnowledge,
      ],
    ];
    for (const [name, value, knowledge] of rateChecks) {
      if (knowledgeIsMissingOrNotRepresented(knowledge) && value === 0) {
        financialMissingAsZero += 1;
        reasons.push(`trip:${trip.sourceDocumentId}:${name}_missing_as_zero`);
      }
      try {
        if (knowledgeIsMissingOrNotRepresented(knowledge)) {
          assertIncompleteNotZero(
            name,
            value,
            knowledge === "conflicting"
              ? "conflicting"
              : knowledge === "unknown"
                ? "unknown"
                : knowledge === "missing"
                  ? "missing"
                  : "not_represented",
          );
        }
      } catch {
        financialMissingAsZero += 1;
        reasons.push(`trip:${trip.sourceDocumentId}:${name}_incomplete_to_zero`);
      }
    }

    // Amounts vs rates: stored amounts may be present while rates are not_represented.
    // That is NOT a conflict — conflict only when knowledge === conflicting.
    if (
      fin.vatRateKnowledge === "conflicting" ||
      fin.platformCommissionRateKnowledge === "conflicting" ||
      fin.totalAppKnowledge === "conflicting" ||
      fin.totalVatKnowledge === "conflicting" ||
      fin.totalMndobKnowledge === "conflicting"
    ) {
      financialConflicts += 1;
      reasons.push(`trip:${trip.sourceDocumentId}:financial_conflicting`);
    }
  }

  return {
    financialConflicts,
    financialMissingAsZero,
    settlementBlocked: true,
    accountingApprovedCount,
    reasons: [...new Set(reasons)],
  };
}

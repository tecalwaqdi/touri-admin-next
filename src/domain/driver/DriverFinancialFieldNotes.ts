/**
 * Phase 4A-5 — Driver financial fields: classify / document ONLY.
 * NOT authoritative. No earnings / VAT / settlement calculation.
 * Finance phase remains blocked.
 */

export type DriverFinancialFieldClass =
  | "legacy_aggregate_major"
  | "wallet_pointer"
  | "bank_pii"
  | "outstanding_online"
  | "not_authoritative";

export type DriverFinancialFieldNote = {
  legacyField: string;
  classification: DriverFinancialFieldClass;
  exposure: "DO_NOT_EXPOSE_YET" | "DOCUMENT_ONLY";
  notes: string;
};

/** Inventory of Legacy user-doc financial-ish fields for drivers (read readiness). */
export const DRIVER_FINANCIAL_FIELD_NOTES: readonly DriverFinancialFieldNote[] =
  [
    {
      legacyField: "total_mndob",
      classification: "legacy_aggregate_major",
      exposure: "DOCUMENT_ONLY",
      notes: "Historical aggregate SAR major on user doc — NOT settlement SoT",
    },
    {
      legacyField: "total_app",
      classification: "legacy_aggregate_major",
      exposure: "DOCUMENT_ONLY",
      notes: "Historical platform aggregate — NOT accounting approval",
    },
    {
      legacyField: "totalMndob2",
      classification: "legacy_aggregate_major",
      exposure: "DOCUMENT_ONLY",
      notes: "Legacy gross-like aggregate — not settlement-eligible",
    },
    {
      legacyField: "Outstandingonlinepayment",
      classification: "outstanding_online",
      exposure: "DOCUMENT_ONLY",
      notes: "Outstanding online pointer — Finance owns interpretation",
    },
    {
      legacyField: "bankNaim",
      classification: "bank_pii",
      exposure: "DO_NOT_EXPOSE_YET",
      notes: "Bank name — identity/financial sensitive",
    },
    {
      legacyField: "bankIdAcc",
      classification: "bank_pii",
      exposure: "DO_NOT_EXPOSE_YET",
      notes: "Bank account id — DO_NOT_EXPOSE",
    },
    {
      legacyField: "ipanBank",
      classification: "bank_pii",
      exposure: "DO_NOT_EXPOSE_YET",
      notes: "IBAN — DO_NOT_EXPOSE",
    },
    {
      legacyField: "banknaimAcc",
      classification: "bank_pii",
      exposure: "DO_NOT_EXPOSE_YET",
      notes: "Account holder name — DO_NOT_EXPOSE",
    },
  ] as const;

export type DriverFinancialPresenceSummary = {
  fieldsPresent: string[];
  fieldsMissing: string[];
  /** Always false in 4A-5 — Finance blocked. */
  isAccountingApproved: false;
  isSettlementSafe: false;
  isAuthoritative: false;
};

export function summarizeDriverFinancialPresence(
  data: Record<string, unknown>,
): DriverFinancialPresenceSummary {
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];
  for (const note of DRIVER_FINANCIAL_FIELD_NOTES) {
    if (
      Object.prototype.hasOwnProperty.call(data, note.legacyField) &&
      data[note.legacyField] != null
    ) {
      fieldsPresent.push(note.legacyField);
    } else {
      fieldsMissing.push(note.legacyField);
    }
  }
  return {
    fieldsPresent,
    fieldsMissing,
    isAccountingApproved: false,
    isSettlementSafe: false,
    isAuthoritative: false,
  };
}

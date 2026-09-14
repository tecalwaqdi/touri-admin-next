/**
 * Phase 4A-6 — Agent financial fields: classify / document ONLY.
 * NOT authoritative. No settlement / commission calculation / payout logic.
 * Finance / Settlements phases remain blocked.
 *
 * Observed Legacy model (document only):
 * - Agent_total = % of platform fee (total_app) → agent_amount on order snapshot
 * - Cash trips: agent commercial share is commission-on-fee, not trip cash float
 * - Card/online: company collects; agent share still fee-% (not settlement SoT here)
 */

export type AgentFinancialFieldClass =
  | "commission_rate_percent"
  | "platform_rate_stored"
  | "vat_rate_stored"
  | "not_authoritative";

export type AgentFinancialFieldNote = {
  legacyField: string;
  classification: AgentFinancialFieldClass;
  exposure: "DO_NOT_EXPOSE_YET" | "DOCUMENT_ONLY";
  notes: string;
};

export const AGENT_FINANCIAL_FIELD_NOTES: readonly AgentFinancialFieldNote[] =
  [
    {
      legacyField: "Agent_total",
      classification: "commission_rate_percent",
      exposure: "DOCUMENT_ONLY",
      notes:
        "Agent share % of platform fee (total_app) — FIN-9 snapshot SoT on order; NOT settlement ledger",
    },
    {
      legacyField: "app_commission_percent",
      classification: "platform_rate_stored",
      exposure: "DOCUMENT_ONLY",
      notes:
        "Stored commercial platform rate on agent user doc — conflicts with trip platform rate story; DOCUMENT_ONLY",
    },
    {
      legacyField: "vat_percent",
      classification: "vat_rate_stored",
      exposure: "DOCUMENT_ONLY",
      notes: "Stored VAT % on agent create path — not trip VAT SoT",
    },
  ] as const;

export type AgentFinancialPresenceSummary = {
  fieldsPresent: string[];
  fieldsMissing: string[];
  /** Always false in 4A-6 — Finance / Settlements blocked. */
  isAccountingApproved: false;
  isSettlementSafe: false;
  isAuthoritative: false;
  /** Documented business model note — not executable logic. */
  cashCardModelNote: "cash_agent_commission_on_fee__card_company_collects_fee_share";
};

export function summarizeAgentFinancialPresence(
  data: Record<string, unknown>,
): AgentFinancialPresenceSummary {
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];
  for (const note of AGENT_FINANCIAL_FIELD_NOTES) {
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
    cashCardModelNote:
      "cash_agent_commission_on_fee__card_company_collects_fee_share",
  };
}

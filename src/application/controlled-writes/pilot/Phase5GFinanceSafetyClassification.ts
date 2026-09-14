/**
 * Phase 5G — finance / wallet / settlement classification for inventory.
 * Does NOT start Finance. Fail-closed: unknown → ineligible for Pilot.
 */

export type Phase5GFinanceImpactClassification = "none" | "present" | "unknown";
export type Phase5GPendingSettlement = true | false | "unknown";
export type Phase5GWalletImpact = "none" | "unknown";

const OUTSTANDING_FIELD = "Outstandingonlinepayment" as const;

const BANK_OR_WALLET_FIELDS = [
  "ipanBank",
  "bankIdAcc",
  "bankNaim",
  "banknaimAcc",
] as const;

function fieldHasMeaningfulValue(v: unknown): boolean {
  return v != null && v !== "" && v !== 0 && v !== false;
}

function fieldPresent(data: Record<string, unknown>, field: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(data, field) &&
    fieldHasMeaningfulValue(data[field])
  );
}

export type Phase5GFinanceSafetyFacts = {
  financeImpactClassification: Phase5GFinanceImpactClassification;
  pendingSettlement: Phase5GPendingSettlement;
  walletImpact: Phase5GWalletImpact;
};

/**
 * Classify finance side-effect risk from Legacy user-doc fields only.
 * Aggregates (total_mndob etc.) alone → none for impact (documented, not SoT),
 * but outstanding / bank / wallet pointers block Pilot eligibility.
 */
export function classifyPhase5GFinanceSafety(
  data: Record<string, unknown>,
): Phase5GFinanceSafetyFacts {
  const hasOutstanding = fieldPresent(data, OUTSTANDING_FIELD);
  const hasBankOrWallet = BANK_OR_WALLET_FIELDS.some((f) =>
    fieldPresent(data, f),
  );

  let pendingSettlement: Phase5GPendingSettlement = false;
  if (hasOutstanding) {
    pendingSettlement = true;
  } else if (
    Object.prototype.hasOwnProperty.call(data, OUTSTANDING_FIELD) &&
    data[OUTSTANDING_FIELD] === undefined
  ) {
    pendingSettlement = "unknown";
  }

  const walletImpact: Phase5GWalletImpact = hasBankOrWallet ? "unknown" : "none";

  let financeImpactClassification: Phase5GFinanceImpactClassification = "none";
  if (hasOutstanding || hasBankOrWallet) {
    financeImpactClassification = "present";
  }

  return {
    financeImpactClassification,
    pendingSettlement,
    walletImpact,
  };
}

/** Pilot requires none / false / none — any unknown or present fails. */
export function isPhase5GFinancePilotSafe(
  facts: Phase5GFinanceSafetyFacts,
): boolean {
  return (
    facts.financeImpactClassification === "none" &&
    facts.pendingSettlement === false &&
    facts.walletImpact === "none"
  );
}

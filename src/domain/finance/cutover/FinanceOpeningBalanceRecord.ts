/**
 * Opening-balance record model for cutover — schema + validation only.
 * Do NOT persist until explicit apply approval. FINANCE_WRITE_ENABLED must stay false.
 */

export const FINANCE_OPENING_BALANCE_COLLECTION =
  "finance_opening_balances" as const;

export type FinanceOpeningBalanceRecord = {
  id: string;
  partyType: "driver" | "agent";
  partyId: string;
  countryId: string;
  currency: string;
  /** Amount party owes company (company receivable), minor units. */
  openingReceivableMinor: string;
  /** Amount company owes party (company payable), minor units. */
  openingPayableMinor: string;
  /** Business date YYYY-MM-DD in Asia/Riyadh. */
  cutoverBusinessDate: string;
  cutoverTimezone: "Asia/Riyadh";
  cutoverUtcInstant: string;
  sourceReferences: string[];
  createdBy: string;
  createdAtUtc: string;
  auditEventId: string | null;
  idempotencyKey: string;
  schemaVersion: 1;
  status: "proposed" | "posted" | "voided";
};

export type FinanceOpeningBalanceCreateInput = Omit<
  FinanceOpeningBalanceRecord,
  "id" | "createdAtUtc" | "auditEventId" | "status"
> & {
  status?: FinanceOpeningBalanceRecord["status"];
};

export function buildOpeningBalanceIdempotencyKey(input: {
  partyType: string;
  partyId: string;
  countryId: string;
  currency: string;
  cutoverBusinessDate: string;
}): string {
  return [
    "finance_opening_balance",
    "v1",
    input.cutoverBusinessDate,
    input.partyType,
    input.partyId,
    input.countryId,
    input.currency,
  ].join("|");
}

export function validateOpeningBalanceRecord(
  row: Partial<FinanceOpeningBalanceRecord>,
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!row.partyType || !["driver", "agent"].includes(row.partyType)) {
    reasons.push("partyType_invalid");
  }
  if (!row.partyId?.trim()) reasons.push("partyId_missing");
  if (!row.countryId?.trim()) reasons.push("countryId_missing");
  if (!row.currency || !/^[A-Za-z]{3}$/.test(row.currency)) {
    reasons.push("currency_invalid");
  }
  if (!row.cutoverBusinessDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    reasons.push("cutoverBusinessDate_invalid");
  }
  if (row.cutoverTimezone !== "Asia/Riyadh") {
    reasons.push("cutoverTimezone_must_be_Asia_Riyadh");
  }
  if (!row.cutoverUtcInstant || Number.isNaN(Date.parse(row.cutoverUtcInstant))) {
    reasons.push("cutoverUtcInstant_invalid");
  }
  if (!Array.isArray(row.sourceReferences) || row.sourceReferences.length === 0) {
    reasons.push("sourceReferences_required");
  }
  if (!row.idempotencyKey?.trim()) reasons.push("idempotencyKey_missing");
  if (row.schemaVersion !== 1) reasons.push("schemaVersion_must_be_1");
  try {
    if (row.openingReceivableMinor != null) BigInt(row.openingReceivableMinor);
    else reasons.push("openingReceivableMinor_missing");
  } catch {
    reasons.push("openingReceivableMinor_unparseable");
  }
  try {
    if (row.openingPayableMinor != null) BigInt(row.openingPayableMinor);
    else reasons.push("openingPayableMinor_missing");
  } catch {
    reasons.push("openingPayableMinor_unparseable");
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** Persist gate — always closed until apply approval. */
export const FINANCE_OPENING_BALANCE_PERSIST_ENABLED = false as const;

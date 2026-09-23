/**
 * Driver wallet read models — Finance SoT adjacent (Legacy wallets / transactions).
 * missing ≠ 0. No UI→Firestore. No invented balances.
 */

export type MoneyAvailability =
  | "available"
  | "missing"
  | "incomplete"
  | "not_represented"
  | "unknown";

export type DriverWalletBalanceField = {
  /** Integer minor units as string when available; null when missing. */
  amountMinor: string | null;
  currency: string | null;
  availability: MoneyAvailability;
  /** Which Legacy field supplied the value (currentBalance vs walletBalance). */
  sourceField: "currentBalance" | "walletBalance" | null;
};

export type DriverWalletListItem = {
  walletId: string;
  driverId: string | null;
  countryId: string | null;
  currency: string | null;
  balance: DriverWalletBalanceField;
  status: string | null;
  updatedAtUtc: string | null;
};

export type DriverWalletLedgerEntry = {
  transactionId: string;
  walletId: string | null;
  driverId: string | null;
  amountMinor: string | null;
  currency: string | null;
  availability: MoneyAvailability;
  type: string | null;
  direction: "credit" | "debit" | "unknown" | null;
  createdAtUtc: string | null;
  note: string | null;
};

export type DriverWalletDetail = {
  wallet: DriverWalletListItem;
  ledger: DriverWalletLedgerEntry[];
  ledgerBounded: true;
  warnings: string[];
};

/** Prefer currentBalance; fall back to walletBalance; never invent 0 from absence. */
export function mapLegacyWalletBalance(input: {
  currentBalance?: unknown;
  walletBalance?: unknown;
  currency?: unknown;
}): DriverWalletBalanceField {
  const currency =
    typeof input.currency === "string" && input.currency.trim()
      ? input.currency.trim().toUpperCase()
      : null;

  const fromMajor = (
    raw: unknown,
    sourceField: "currentBalance" | "walletBalance",
  ): DriverWalletBalanceField | null => {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return {
        amountMinor: String(Math.round(raw * 100)),
        currency,
        availability: "available",
        sourceField,
      };
    }
    if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) {
      return {
        amountMinor: String(Math.round(Number(raw) * 100)),
        currency,
        availability: "available",
        sourceField,
      };
    }
    if (typeof raw === "bigint") {
      return {
        amountMinor: raw.toString(),
        currency,
        availability: "available",
        sourceField,
      };
    }
    return null;
  };

  const primary = fromMajor(input.currentBalance, "currentBalance");
  if (primary) return primary;
  const secondary = fromMajor(input.walletBalance, "walletBalance");
  if (secondary) return secondary;

  const hasAnyKey =
    input.currentBalance !== undefined || input.walletBalance !== undefined;
  return {
    amountMinor: null,
    currency,
    availability: hasAnyKey ? "incomplete" : "missing",
    sourceField: null,
  };
}

export function mapLegacyWalletDoc(input: {
  id: string;
  data: Record<string, unknown>;
}): DriverWalletListItem {
  const d = input.data;
  const driverId =
    (typeof d.driverId === "string" && d.driverId.trim()) ||
    (typeof d.mndobId === "string" && d.mndobId.trim()) ||
    (typeof d.userId === "string" && d.userId.trim()) ||
    (typeof d.uid === "string" && d.uid.trim()) ||
    null;
  const countryId =
    (typeof d.countryId === "string" && d.countryId.trim()) ||
    (typeof d.country_id === "string" && d.country_id.trim()) ||
    null;
  const currency =
    (typeof d.currency === "string" && d.currency.trim().toUpperCase()) ||
    (typeof d.currencyCode === "string" && d.currencyCode.trim().toUpperCase()) ||
    null;
  const status =
    (typeof d.status === "string" && d.status.trim()) ||
    (typeof d.walletStatus === "string" && d.walletStatus.trim()) ||
    null;
  const updatedAtUtc =
    (typeof d.updatedAt === "string" && d.updatedAt) ||
    (typeof d.updated_at === "string" && d.updated_at) ||
    null;

  return {
    walletId: input.id,
    driverId,
    countryId,
    currency,
    balance: mapLegacyWalletBalance({
      currentBalance: d.currentBalance,
      walletBalance: d.walletBalance,
      currency,
    }),
    status,
    updatedAtUtc,
  };
}

export function mapLegacyTransactionDoc(input: {
  id: string;
  data: Record<string, unknown>;
}): DriverWalletLedgerEntry {
  const d = input.data;
  const rawAmount = d.amount ?? d.amountMinor ?? d.value;
  let amountMinor: string | null = null;
  let availability: MoneyAvailability = "missing";
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    // Legacy amounts often majors; if abs >= 1000 treat cautiously as major.
    amountMinor = String(Math.round(rawAmount * 100));
    availability = "available";
  } else if (typeof rawAmount === "string" && Number.isFinite(Number(rawAmount))) {
    amountMinor = String(Math.round(Number(rawAmount) * 100));
    availability = "available";
  } else if (typeof rawAmount === "bigint") {
    amountMinor = rawAmount.toString();
    availability = "available";
  } else if (rawAmount != null) {
    availability = "incomplete";
  }

  const type =
    (typeof d.type === "string" && d.type.trim()) ||
    (typeof d.transactionType === "string" && d.transactionType.trim()) ||
    null;
  const dirRaw =
    (typeof d.direction === "string" && d.direction.trim().toLowerCase()) ||
    (typeof d.side === "string" && d.side.trim().toLowerCase()) ||
    "";
  let direction: DriverWalletLedgerEntry["direction"] = null;
  if (dirRaw === "credit" || dirRaw === "in" || dirRaw === "deposit") {
    direction = "credit";
  } else if (dirRaw === "debit" || dirRaw === "out" || dirRaw === "withdraw") {
    direction = "debit";
  } else if (type) {
    direction = "unknown";
  }

  return {
    transactionId: input.id,
    walletId:
      (typeof d.walletId === "string" && d.walletId.trim()) ||
      (typeof d.wallet_id === "string" && d.wallet_id.trim()) ||
      null,
    driverId:
      (typeof d.driverId === "string" && d.driverId.trim()) ||
      (typeof d.mndobId === "string" && d.mndobId.trim()) ||
      (typeof d.userId === "string" && d.userId.trim()) ||
      null,
    amountMinor,
    currency:
      (typeof d.currency === "string" && d.currency.trim().toUpperCase()) ||
      null,
    availability,
    type,
    direction,
    createdAtUtc:
      (typeof d.createdAt === "string" && d.createdAt) ||
      (typeof d.created_at === "string" && d.created_at) ||
      (typeof d.created_time === "string" && d.created_time) ||
      null,
    note:
      (typeof d.note === "string" && d.note.trim()) ||
      (typeof d.reason === "string" && d.reason.trim()) ||
      null,
  };
}

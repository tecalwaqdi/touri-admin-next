/**
 * Phase 4A-4 — Payment method + payment status (orthogonal to lifecycle).
 * Evidence: TourySystemStatusCodes payment constants; PaymentMethod enum Cash|OnlinePayment;
 * financial_accounting_engine separates lifecycle vs payment.
 */

export const TRIP_PAYMENT_METHODS = [
  "cash",
  "online",
  "unknown",
  "unmapped",
] as const;

export type TripPaymentMethod = (typeof TRIP_PAYMENT_METHODS)[number];

export const TRIP_PAYMENT_STATUSES = [
  "unpaid",
  "pending_cash",
  "cash_collected",
  "processing",
  "paid",
  "failed",
  "refunded",
  "unmapped",
] as const;

export type TripPaymentStatus = (typeof TRIP_PAYMENT_STATUSES)[number];

const PAYMENT_STATUS_ALIAS: Record<string, TripPaymentStatus> = {
  unpaid: "unpaid",
  pending_cash: "pending_cash",
  cash_pending: "pending_cash",
  cash_due: "pending_cash",
  cash_collected: "cash_collected",
  processing: "processing",
  paid: "paid",
  captured: "paid",
  failed: "failed",
  refunded: "refunded",
};

export type TripPaymentResolveResult = {
  method: TripPaymentMethod;
  methodRaw: string | null;
  status: TripPaymentStatus;
  statusRaw: string | null;
  warnings: string[];
};

/**
 * PaymentMethod enum: Cash | OnlinePayment (Admi enums.dart).
 * Also accept lowercase / payment_method snake variants — never invent from payment_status alone
 * as authoritative method (engine may infer only as Legacy UX fallback; we mark unknown).
 */
export function resolveTripPaymentMethod(
  raw: unknown,
): { method: TripPaymentMethod; raw: string | null; warnings: string[] } {
  if (raw == null || raw === "") {
    return { method: "unknown", raw: null, warnings: ["payment_method_missing"] };
  }
  const s = String(raw).trim();
  const n = s.toLowerCase();
  if (n === "cash" || n === "paymentmethod.cash") {
    return { method: "cash", raw: s, warnings: [] };
  }
  if (
    n === "onlinepayment" ||
    n === "online" ||
    n === "online_payment" ||
    n === "card" ||
    n === "paymentmethod.onlinepayment"
  ) {
    return { method: "online", raw: s, warnings: [] };
  }
  return {
    method: "unmapped",
    raw: s,
    warnings: [`unmapped_payment_method:${s}`],
  };
}

export function resolveTripPaymentStatus(
  raw: unknown,
): { status: TripPaymentStatus; raw: string | null; warnings: string[] } {
  if (raw == null || raw === "") {
    return { status: "unmapped", raw: null, warnings: ["payment_status_missing"] };
  }
  const s = String(raw).trim();
  const mapped = PAYMENT_STATUS_ALIAS[s.toLowerCase()];
  if (mapped) {
    return { status: mapped, raw: s, warnings: [] };
  }
  return {
    status: "unmapped",
    raw: s,
    warnings: [`unmapped_payment_status:${s}`],
  };
}

export function resolveTripPayment(input: {
  PaymentMethod?: unknown;
  paymentMethod?: unknown;
  payment_method?: unknown;
  payment_status?: unknown;
  paymentStatus?: unknown;
}): TripPaymentResolveResult {
  const methodRes = resolveTripPaymentMethod(
    input.PaymentMethod ?? input.paymentMethod ?? input.payment_method,
  );
  const statusRes = resolveTripPaymentStatus(
    input.payment_status ?? input.paymentStatus,
  );
  return {
    method: methodRes.method,
    methodRaw: methodRes.raw,
    status: statusRes.status,
    statusRaw: statusRes.raw,
    warnings: [...methodRes.warnings, ...statusRes.warnings],
  };
}

/**
 * Phase 4A-7 — Customer financial field classification (DOCUMENT_ONLY).
 * No wallet math, settlements, VAT, or payment execution.
 */

export type CustomerFinancialFieldClass =
  | "activity_count_document_only"
  | "wallet_do_not_expose"
  | "payment_do_not_expose"
  | "unknown";

export const CUSTOMER_FINANCIAL_FIELD_NOTES: Array<{
  legacyField: string;
  classification: CustomerFinancialFieldClass;
  exposure: "DOCUMENT_ONLY" | "DO_NOT_EXPOSE_YET";
  note: string;
}> = [
  {
    legacyField: "Bookings_User",
    classification: "activity_count_document_only",
    exposure: "DOCUMENT_ONLY",
    note: "Admin list bookings count label — not ledger",
  },
  {
    legacyField: "bookings_count",
    classification: "activity_count_document_only",
    exposure: "DOCUMENT_ONLY",
    note: "Alias activity count — DOCUMENT_ONLY",
  },
  {
    legacyField: "total_bookings",
    classification: "activity_count_document_only",
    exposure: "DOCUMENT_ONLY",
    note: "Alias activity count — DOCUMENT_ONLY",
  },
  {
    legacyField: "orders_count",
    classification: "activity_count_document_only",
    exposure: "DOCUMENT_ONLY",
    note: "Alias activity count — DOCUMENT_ONLY",
  },
  {
    legacyField: "wallet_balance",
    classification: "wallet_do_not_expose",
    exposure: "DO_NOT_EXPOSE_YET",
    note: "Wallet / balance — Finance phase only",
  },
  {
    legacyField: "Outstandingonlinepayment",
    classification: "payment_do_not_expose",
    exposure: "DO_NOT_EXPOSE_YET",
    note: "Payment outstanding — not Customer readiness",
  },
];

export function summarizeCustomerFinancialPresence(
  data: Record<string, unknown>,
): {
  fieldsPresent: string[];
  fieldsMissing: string[];
  bookingsCountKnown: boolean;
  bookingsCount: number | null;
  isAccountingApproved: false;
  isSettlementSafe: false;
  isAuthoritative: false;
} {
  const watched = [
    "Bookings_User",
    "bookings_count",
    "total_bookings",
    "orders_count",
    "wallet_balance",
    "Outstandingonlinepayment",
  ];
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];
  for (const f of watched) {
    if (data[f] != null && data[f] !== "") fieldsPresent.push(f);
    else fieldsMissing.push(f);
  }

  let bookingsCount: number | null = null;
  for (const f of [
    "Bookings_User",
    "bookings_count",
    "total_bookings",
    "orders_count",
  ]) {
    const v = data[f];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) {
      bookingsCount = n;
      break;
    }
  }

  return {
    fieldsPresent,
    fieldsMissing,
    bookingsCountKnown: bookingsCount != null,
    bookingsCount,
    isAccountingApproved: false,
    isSettlementSafe: false,
    isAuthoritative: false,
  };
}

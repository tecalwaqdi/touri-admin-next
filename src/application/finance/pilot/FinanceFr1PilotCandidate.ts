/**
 * FR1 pilot candidate classification + synthetic/test safety gates.
 * Prefer synthetic/test completed trips. Never auto-select real financial records.
 */

export type FinanceFr1TripClassification =
  | "synthetic_test"
  | "real_financial"
  | "unknown";

export type FinanceFr1CandidateOrder = {
  documentId: string;
  data: Record<string, unknown>;
};

const SYNTHETIC_ID_PREFIXES = ["test_", "synthetic_", "fixture_", "fake_"] as const;

function truthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function stringField(data: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Classify order as synthetic/test vs real vs unknown.
 * Synthetic markers: explicit flags, id prefixes, fixture notes.
 */
export function classifyFinanceFr1Trip(
  order: FinanceFr1CandidateOrder,
): FinanceFr1TripClassification {
  const { documentId, data } = order;
  const idLower = documentId.toLowerCase();

  if (
    truthyFlag(data.synthetic) ||
    truthyFlag(data.is_synthetic) ||
    truthyFlag(data.isSynthetic) ||
    truthyFlag(data.is_test) ||
    truthyFlag(data.isTest) ||
    truthyFlag(data.test) ||
    truthyFlag(data.fixture) ||
    truthyFlag(data.admin_next_finance_fixture)
  ) {
    return "synthetic_test";
  }

  for (const prefix of SYNTHETIC_ID_PREFIXES) {
    if (idLower.startsWith(prefix)) return "synthetic_test";
  }

  const notes = stringField(data, [
    "notes",
    "note",
    "admin_notes",
    "fixture_tag",
    "source",
  ]);
  if (notes) {
    const n = notes.toLowerCase();
    if (
      n.includes("synthetic") ||
      n.includes("fixture") ||
      n.includes("test_trip") ||
      n.includes("finance_pilot")
    ) {
      return "synthetic_test";
    }
  }

  const customerName = stringField(data, [
    "user_name",
    "customer_name",
    "name",
  ]);
  if (customerName) {
    const c = customerName.toLowerCase();
    if (c.includes("test") || c.includes("synthetic") || c.includes("fixture")) {
      return "synthetic_test";
    }
  }

  // Explicit real markers → real_financial
  if (
    truthyFlag(data.production_financial) ||
    truthyFlag(data.real_trip) ||
    (typeof data.payment_status === "string" &&
      data.payment_status.length > 0 &&
      !truthyFlag(data.synthetic))
  ) {
    // Still unknown unless we have strong synthetic evidence — prefer unknown
    // over auto-classifying as real when ambiguous.
  }

  // Default: unknown (not safe for auto pilot selection)
  return "unknown";
}

export function isSafeSyntheticFinanceFr1Candidate(
  order: FinanceFr1CandidateOrder,
): boolean {
  return classifyFinanceFr1Trip(order) === "synthetic_test";
}

/**
 * Select exactly ONE safe synthetic/test completed trip.
 * If none → null (caller returns NO-GO). Never falls back to real records.
 */
export function selectOneSafeSyntheticFinanceFr1Candidate(
  orders: FinanceFr1CandidateOrder[],
): FinanceFr1CandidateOrder | null {
  const safe = orders.filter(isSafeSyntheticFinanceFr1Candidate);
  if (safe.length === 0) return null;
  // Deterministic: lowest documentId among safe candidates.
  return [...safe].sort((a, b) => a.documentId.localeCompare(b.documentId))[0]!;
}

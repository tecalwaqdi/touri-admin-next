/**
 * Phase 3.6 — field provenance for Canonical Read Models.
 * Unknown / missing / unproven / not_represented MUST NOT coerce to 0.
 */

export type MappingConfidence =
  | "high"
  | "medium"
  | "low"
  | "unknown"
  | "unproven";

/** Canonical financial field availability — incomplete ≠ zero. */
export type FinancialAvailabilityStatus =
  | "available"
  | "derived"
  | "missing"
  | "unknown"
  | "not_represented"
  | "conflicting";

export type FieldProvenance<T = unknown> = {
  sourceSystem: "legacy" | "synthetic" | "admin_next" | "unknown";
  sourceCollection: string | null;
  sourceDocumentId: string | null;
  sourceField: string | null;
  sourceValue: T | null;
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  warnings: string[];
  /** Phase 3.6 — explicit availability; never invent zeros for non-available. */
  availabilityStatus?: FinancialAvailabilityStatus;
  /** Provenance for derived values. */
  derivedFrom?: string[];
  formulaId?: string | null;
};

export type FinancialConceptClass =
  | "A_authoritative_persisted"
  | "B_reliable_derived"
  | "C_conflicting"
  | "D_missing"
  | "E_unknown";

export const CANONICAL_MAPPING_VERSION = "phase-3.6-v1";

export function nullWithProvenance<T>(
  reason: string,
  extras?: Partial<FieldProvenance<T>> & {
    availabilityStatus?: FinancialAvailabilityStatus;
  },
): { value: null; provenance: FieldProvenance<T> } {
  return {
    value: null,
    provenance: {
      sourceSystem: extras?.sourceSystem ?? "unknown",
      sourceCollection: extras?.sourceCollection ?? null,
      sourceDocumentId: extras?.sourceDocumentId ?? null,
      sourceField: extras?.sourceField ?? null,
      sourceValue: extras?.sourceValue ?? null,
      mappingConfidence: extras?.mappingConfidence ?? "unknown",
      mappingVersion: extras?.mappingVersion ?? CANONICAL_MAPPING_VERSION,
      warnings: [reason, ...(extras?.warnings ?? [])],
      availabilityStatus: extras?.availabilityStatus ?? "missing",
      derivedFrom: extras?.derivedFrom,
      formulaId: extras?.formulaId ?? null,
    },
  };
}

export function provenValue<T>(
  value: T,
  provenance: Omit<
    FieldProvenance<T>,
    "mappingVersion" | "warnings" | "sourceValue"
  > & {
    sourceValue?: T | null;
    warnings?: string[];
    mappingVersion?: string;
    availabilityStatus?: FinancialAvailabilityStatus;
    derivedFrom?: string[];
    formulaId?: string | null;
  },
): { value: T; provenance: FieldProvenance<T> } {
  return {
    value,
    provenance: {
      ...provenance,
      mappingVersion: provenance.mappingVersion ?? CANONICAL_MAPPING_VERSION,
      warnings: provenance.warnings ?? [],
      sourceValue: provenance.sourceValue ?? value,
      availabilityStatus: provenance.availabilityStatus ?? "available",
      derivedFrom: provenance.derivedFrom,
      formulaId: provenance.formulaId ?? null,
    },
  };
}

/** Production Read must not treat C/D/E as final numbers. */
export function isProductionReadableClass(
  classification: FinancialConceptClass,
): boolean {
  return (
    classification === "A_authoritative_persisted" ||
    classification === "B_reliable_derived"
  );
}

/**
 * Forbidden: coerce null/undefined/missing/NaN → 0 for canonical financial amounts.
 * Returns true when a value must remain null (never invent zero).
 */
export function mustRemainNullNotZero(
  value: number | null | undefined,
  availability?: FinancialAvailabilityStatus,
): boolean {
  if (value == null) return true;
  if (!Number.isFinite(value)) return true;
  if (
    availability === "missing" ||
    availability === "unknown" ||
    availability === "not_represented" ||
    availability === "conflicting"
  ) {
    return true;
  }
  return false;
}

/** Assert mapper never invents zero for non-available statuses. */
export function assertIncompleteNotZero(
  fieldName: string,
  value: number | null | undefined,
  availability: FinancialAvailabilityStatus,
): void {
  if (
    (availability === "missing" ||
      availability === "unknown" ||
      availability === "not_represented" ||
      availability === "conflicting") &&
    value === 0
  ) {
    throw new Error(
      `INCOMPLETE_TO_ZERO_FORBIDDEN: ${fieldName} availability=${availability} must not be 0`,
    );
  }
  if ((value == null || !Number.isFinite(value)) && value === 0) {
    throw new Error(`INCOMPLETE_TO_ZERO_FORBIDDEN: ${fieldName}`);
  }
}

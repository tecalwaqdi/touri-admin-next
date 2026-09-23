/**
 * Truthful Admin Next data-source labels.
 * Production Firestore reads are never labelled development_synthetic solely for test_ IDs.
 * Pilot/test documents in Production → production_pilot.
 */

export type AdminDataSourceLabel =
  | "development_synthetic"
  | "production"
  | "production_pilot"
  | "unavailable";

/** @deprecated Use development_synthetic — retained for transitional reads only. */
export type LegacySyntheticLabelAlias = "synthetic";

export type AdminDataSourceLabelView = {
  label: AdminDataSourceLabel;
  /** English UI copy */
  en: string;
  /** Arabic UI copy */
  ar: string;
  /** API/meta machine value */
  code: AdminDataSourceLabel;
  synthetic: boolean;
};

const PILOT_ID_RE =
  /(?:^|_)(?:test_|test_adminnext_|pilot_|fr[1-7]_)/i;

export function looksLikePilotOrTestDocumentId(id: string | null | undefined): boolean {
  if (!id) return false;
  return PILOT_ID_RE.test(id) || id.startsWith("test_");
}

export function anyPilotDocumentIds(
  ids: Array<string | null | undefined> | null | undefined,
): boolean {
  if (!ids?.length) return false;
  return ids.some((id) => looksLikePilotOrTestDocumentId(id));
}

export function resolveAdminDataSourceLabel(input: {
  /** Application source is synthetic fixtures (dev/mock only). */
  syntheticSource?: boolean;
  /** Read came from Production Firestore. */
  productionFirestore?: boolean;
  /** Explicit unavailable / not configured. */
  unavailable?: boolean;
  /** Document IDs in the response (for pilot detection). */
  documentIds?: Array<string | null | undefined>;
  containsPilotRecords?: boolean;
}): AdminDataSourceLabelView {
  if (input.unavailable) {
    return {
      label: "unavailable",
      code: "unavailable",
      en: "Source unavailable",
      ar: "المصدر غير متاح",
      synthetic: false,
    };
  }
  if (input.syntheticSource) {
    return {
      label: "development_synthetic",
      code: "development_synthetic",
      en: "Development synthetic data",
      ar: "بيانات تطوير تجريبية",
      synthetic: true,
    };
  }
  if (input.productionFirestore) {
    if (input.containsPilotRecords || anyPilotDocumentIds(input.documentIds)) {
      return {
        label: "production_pilot",
        code: "production_pilot",
        en: "Production (internal — pilot records included)",
        ar: "إنتاج (داخلي — يتضمن سجلات تجريبية)",
        synthetic: false,
      };
    }
    return {
      label: "production",
      code: "production",
      en: "Production",
      ar: "بيانات الإنتاج",
      synthetic: false,
    };
  }
  return {
    label: "unavailable",
    code: "unavailable",
    en: "Source unavailable",
    ar: "المصدر غير متاح",
    synthetic: false,
  };
}

/** Forbidden in Production: silent mock/synthetic fallback. */
export function assertNoProductionSyntheticFallback(input: {
  appEnv: string;
  syntheticSource: boolean;
}): void {
  if (
    (input.appEnv === "production" || input.appEnv === "staging") &&
    input.syntheticSource
  ) {
    throw new Error(
      "PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN: mock/synthetic data must not back Production UI",
    );
  }
}

/** Normalize legacy "synthetic" label strings from older payloads. */
export function normalizeSourceLabelCode(
  raw: string | null | undefined,
): AdminDataSourceLabel {
  if (raw === "synthetic" || raw === "development_synthetic") {
    return "development_synthetic";
  }
  if (raw === "production" || raw === "production_pilot" || raw === "unavailable") {
    return raw;
  }
  return "unavailable";
}

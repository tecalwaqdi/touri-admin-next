/**
 * Truthful Admin Next data-source labels.
 * Production Firestore reads are never labelled "synthetic" solely for test_ IDs.
 * Pilot/test documents in Production → production_pilot.
 */

export type AdminDataSourceLabel =
  | "synthetic"
  | "production"
  | "production_pilot"
  | "unavailable";

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
}): AdminDataSourceLabelView {
  if (input.unavailable) {
    return {
      label: "unavailable",
      code: "unavailable",
      en: "Unavailable",
      ar: "غير متاح",
      synthetic: false,
    };
  }
  if (input.syntheticSource) {
    return {
      label: "synthetic",
      code: "synthetic",
      en: "Synthetic (development only)",
      ar: "بيانات تجريبية (تطوير فقط)",
      synthetic: true,
    };
  }
  if (input.productionFirestore) {
    if (anyPilotDocumentIds(input.documentIds)) {
      return {
        label: "production_pilot",
        code: "production_pilot",
        en: "Production / pilot records present",
        ar: "إنتاج / سجلات تجريبية موجودة",
        synthetic: false,
      };
    }
    return {
      label: "production",
      code: "production",
      en: "Production",
      ar: "إنتاج",
      synthetic: false,
    };
  }
  return {
    label: "unavailable",
    code: "unavailable",
    en: "Unavailable",
    ar: "غير متاح",
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

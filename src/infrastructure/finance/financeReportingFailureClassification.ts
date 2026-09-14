/**
 * FR7 finance reporting failure classification (server-side only).
 * Never attaches Authorization/Bearer, passwords, API keys, private keys,
 * credential JSON, or OIDC/access tokens.
 */

import { sanitizeCredentialMessage } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

export type FinanceReportingFailureCategory =
  | "ADC_MISSING"
  | "WIF_CONFIG_MISSING"
  | "WIF_TOKEN_MISSING"
  | "CREDENTIALS_INVALID"
  | "FIRESTORE_PERMISSION_DENIED"
  | "FIRESTORE_UNAVAILABLE"
  | "PROJECT_MISMATCH"
  | "SCOPE_DENIED"
  | "FORBIDDEN"
  | "UNKNOWN";

export type FinanceReportingFailureCode =
  | "FR7_ADC_MISSING"
  | "FR7_WIF_CONFIG_MISSING"
  | "FR7_WIF_TOKEN_MISSING"
  | "FR7_CREDENTIALS_INVALID"
  | "FR7_FIRESTORE_PERMISSION_DENIED"
  | "FR7_FIRESTORE_UNAVAILABLE"
  | "FR7_PROJECT_MISMATCH"
  | "SCOPE_DENIED"
  | "FORBIDDEN"
  | "INTERNAL";

export type FinanceReportingFailureClassification = {
  category: FinanceReportingFailureCategory;
  code: FinanceReportingFailureCode;
  sanitizedMessage: string;
};

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "error");
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const raw = (err as { code: unknown }).code;
    if (typeof raw === "string" || typeof raw === "number") {
      return String(raw);
    }
  }
  return "";
}

/**
 * Map thrown finance/Firestore/credential errors to stable operator codes.
 */
export function classifyFinanceReportingFailure(
  err: unknown,
): FinanceReportingFailureClassification {
  const msg = rawMessage(err);
  const code = errorCode(err);
  const sanitizedMessage = sanitizeCredentialMessage(msg).slice(0, 240);

  if (
    msg.startsWith("invalid_country_id:") ||
    msg.startsWith("cross_country_denied:") ||
    msg.startsWith("scope_denied:")
  ) {
    return { category: "SCOPE_DENIED", code: "SCOPE_DENIED", sanitizedMessage };
  }
  if (msg.startsWith("rbac_denied:")) {
    return { category: "FORBIDDEN", code: "FORBIDDEN", sanitizedMessage };
  }

  if (
    code === "PROJECT_FINGERPRINT_MISMATCH" ||
    /PROJECT_FINGERPRINT_MISMATCH|projectId mismatch/i.test(msg)
  ) {
    return {
      category: "PROJECT_MISMATCH",
      code: "FR7_PROJECT_MISMATCH",
      sanitizedMessage,
    };
  }

  if (
    code === "FR7_WIF_CONFIG_INCOMPLETE" ||
    /WIF_CONFIG_INCOMPLETE|GCP_WORKLOAD_IDENTITY_PROVIDER|GCP_SERVICE_ACCOUNT_EMAIL/i.test(
      msg,
    )
  ) {
    return {
      category: "WIF_CONFIG_MISSING",
      code: "FR7_WIF_CONFIG_MISSING",
      sanitizedMessage,
    };
  }

  if (
    code === "FR7_WIF_TOKEN_MISSING" ||
    /VERCEL_OIDC_TOKEN|OIDC token missing|WIF_TOKEN_MISSING/i.test(msg)
  ) {
    return {
      category: "WIF_TOKEN_MISSING",
      code: "FR7_WIF_TOKEN_MISSING",
      sanitizedMessage,
    };
  }

  if (
    code === "PRODUCTION_CREDENTIALS_INVALID" ||
    code === "PRODUCTION_CREDENTIALS_LEAK_GUARD" ||
    /SA JSON keys forbidden|GOOGLE_APPLICATION_CREDENTIALS must be unset|Only application_default|private_key|BEGIN PRIVATE/i.test(
      msg,
    )
  ) {
    return {
      category: "CREDENTIALS_INVALID",
      code: "FR7_CREDENTIALS_INVALID",
      sanitizedMessage,
    };
  }

  if (
    code === "PRODUCTION_CREDENTIALS_MISSING" ||
    code === "FR7_ADC_MISSING" ||
    /Could not load the default credentials|application default credentials|Unable to authenticate your request|ADC_MISSING/i.test(
      msg,
    )
  ) {
    return {
      category: "ADC_MISSING",
      code: "FR7_ADC_MISSING",
      sanitizedMessage,
    };
  }

  if (
    code === "7" ||
    /PERMISSION_DENIED|insufficient permissions|Missing or insufficient permissions/i.test(
      msg,
    )
  ) {
    return {
      category: "FIRESTORE_PERMISSION_DENIED",
      code: "FR7_FIRESTORE_PERMISSION_DENIED",
      sanitizedMessage,
    };
  }

  if (
    code === "14" ||
    /UNAVAILABLE|ECONNREFUSED|ETIMEDOUT|DEADLINE_EXCEEDED|firestore.*unavailable/i.test(
      msg,
    )
  ) {
    return {
      category: "FIRESTORE_UNAVAILABLE",
      code: "FR7_FIRESTORE_UNAVAILABLE",
      sanitizedMessage,
    };
  }

  return {
    category: "UNKNOWN",
    code: "INTERNAL",
    sanitizedMessage,
  };
}

/** Client-facing 500 body — generic in Production; never leaks credentials. */
export function financeReportingClientErrorMessage(err: unknown): string {
  const productionIntent =
    process.env.APP_ENV === "production" ||
    process.env.EXPECTED_ENVIRONMENT === "production" ||
    process.env.NODE_ENV === "production";
  if (productionIntent) {
    return "An unexpected error occurred";
  }
  const classified = classifyFinanceReportingFailure(err);
  if (/secret|password|token|credential|private_key|Bearer/i.test(classified.sanitizedMessage)) {
    return "An unexpected error occurred";
  }
  return classified.sanitizedMessage || "An unexpected error occurred";
}

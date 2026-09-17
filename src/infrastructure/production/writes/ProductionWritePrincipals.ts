/**
 * Least-privilege WIF write principals — documentation + runtime resolution.
 * Shadow-reader (`GCP_SERVICE_ACCOUNT_EMAIL`) is NEVER used for writes.
 * Do not invent IAM grants; operators follow runbooks.
 */

export const PRODUCTION_PROJECT_ID = "tutorial-multi-language-70gx4j" as const;

export const WRITE_PRINCIPALS = {
  shadow_reader: {
    env: "GCP_SERVICE_ACCOUNT_EMAIL",
    email: `touri-admin-next-shadow-reader@${PRODUCTION_PROJECT_ID}.iam.gserviceaccount.com`,
    purpose: "read_only",
    mayWrite: false,
  },
  driver_review: {
    env: "DRIVER_REVIEW_SERVICE_ACCOUNT_EMAIL",
    email: `touri-admin-next-driver-review@${PRODUCTION_PROJECT_ID}.iam.gserviceaccount.com`,
    purpose: "driver_review_bindings_and_allowlisted_user_patch",
    mayWrite: true,
    collections: ["admin_next_driver_review_requests", "user", "admin_next_cw_audit", "admin_next_cw_idempotency"],
  },
  identity_admin: {
    env: "GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL",
    email: `touri-admin-next-identity-admin@${PRODUCTION_PROJECT_ID}.iam.gserviceaccount.com`,
    purpose: "persona_user_allowlisted_fields_only",
    mayWrite: true,
    collections: ["user", "admin_next_cw_audit", "admin_next_cw_idempotency"],
  },
  ops_writer: {
    env: "GCP_OPS_WRITE_SERVICE_ACCOUNT_EMAIL",
    email: `touri-admin-next-ops-writer@${PRODUCTION_PROJECT_ID}.iam.gserviceaccount.com`,
    purpose: "agent_customer_geography_catalog_support_notification",
    mayWrite: true,
    collections: [
      "user",
      "countries",
      "cities",
      "villages",
      "mkan",
      "type_car",
      "transport_company",
      "support",
      "admin_panel_notifications",
      "admin_next_cw_audit",
      "admin_next_cw_idempotency",
    ],
  },
  finance_writer: {
    env: "GCP_FINANCE_WRITE_SERVICE_ACCOUNT_EMAIL",
    email: `touri-admin-next-finance-writer@${PRODUCTION_PROJECT_ID}.iam.gserviceaccount.com`,
    purpose: "settlement_v2_fr1_fr7_only",
    mayWrite: true,
    collections: [
      "settlements_v2",
      "settlement_payments_v2",
      "financial_periods",
      "finance_adjustments_v2",
      "admin_next_cw_audit",
      "admin_next_cw_idempotency",
    ],
  },
} as const;

export type WritePrincipalKey = keyof typeof WRITE_PRINCIPALS;

export type ResolvedWritePrincipal = {
  key: WritePrincipalKey;
  email: string;
  envVar: string;
  ready: boolean;
  reason?: string;
};

export function resolveWritePrincipal(
  key: Exclude<WritePrincipalKey, "shadow_reader">,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedWritePrincipal {
  const spec = WRITE_PRINCIPALS[key];
  const configured = env[spec.env]?.trim() ?? "";
  const provider = env.GCP_WORKLOAD_IDENTITY_PROVIDER?.trim() ?? "";
  const shadow = env.GCP_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return {
      key,
      email: spec.email,
      envVar: spec.env,
      ready: false,
      reason: "SA_JSON_FORBIDDEN",
    };
  }
  if (!provider) {
    return {
      key,
      email: spec.email,
      envVar: spec.env,
      ready: false,
      reason: "WIF_PROVIDER_MISSING",
    };
  }
  if (!configured) {
    return {
      key,
      email: spec.email,
      envVar: spec.env,
      ready: false,
      reason: "WRITE_SA_ENV_MISSING",
    };
  }
  if (configured !== spec.email) {
    return {
      key,
      email: spec.email,
      envVar: spec.env,
      ready: false,
      reason: "WRITE_SA_EMAIL_MISMATCH",
    };
  }
  if (shadow && configured === shadow) {
    return {
      key,
      email: spec.email,
      envVar: spec.env,
      ready: false,
      reason: "SHADOW_READER_MUST_NOT_WRITE",
    };
  }
  return { key, email: configured, envVar: spec.env, ready: true };
}

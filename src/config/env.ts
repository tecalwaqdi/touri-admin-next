import { z } from "zod";
import { assertAuthModeAllowed } from "@/config/authModeGuard";
import { assertFinanceReportingStartupOrThrow } from "@/infrastructure/production/ops/FinanceReportingStartupGuard";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
    throw new Error(`Invalid boolean env value: ${value}`);
  })
  .default(false);

const appEnvSchema = z.enum(["development", "staging", "production"]);

/**
 * Production unset → production_read_only when writes are all false (never silent synthetic).
 * Explicit synthetic/test in Production with writes false still fail-closed in superRefine.
 * Write-armed Production pilots keep an explicit/non-RO mode (see startup guard).
 */
function withProductionFinanceSourceDefault(
  raw: unknown,
): Record<string, unknown> {
  const r =
    raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const appEnv = String(r.APP_ENV ?? r.NEXT_PUBLIC_APP_ENV ?? "development");
  const expected = String(r.EXPECTED_ENVIRONMENT ?? appEnv);
  const nodeEnv = String(r.NODE_ENV ?? "development");
  const productionIntent =
    appEnv === "production" ||
    (expected === "production" && nodeEnv === "production");
  const mode = r.FINANCE_REPORTING_SOURCE_MODE;
  const unset = mode === undefined || mode === null || String(mode).trim() === "";
  const truthy = (v: unknown) => {
    if (typeof v === "boolean") return v;
    const n = String(v ?? "")
      .trim()
      .toLowerCase();
    return n === "1" || n === "true" || n === "yes" || n === "on";
  };
  const anyWrite =
    truthy(r.PRODUCTION_WRITE_ENABLED) ||
    truthy(r.GLOBAL_PRODUCTION_WRITE_ENABLED) ||
    truthy(r.FINANCE_WRITE_ENABLED) ||
    truthy(r.DRIVER_WRITE_ENABLED) ||
    truthy(r.AGENT_WRITE_ENABLED) ||
    truthy(r.CUSTOMER_WRITE_ENABLED) ||
    truthy(r.CUSTOMER_AUTH_WRITE_ENABLED) ||
    truthy(r.GEOGRAPHY_WRITE_ENABLED) ||
    truthy(r.REGION_WRITE_ENABLED) ||
    truthy(r.VEHICLE_CATALOG_WRITE_ENABLED) ||
    truthy(r.PARTNER_WRITE_ENABLED) ||
    truthy(r.FLEET_WRITE_ENABLED) ||
    truthy(r.GUIDE_WRITE_ENABLED) ||
    truthy(r.ADMIN_IDENTITY_WRITE_ENABLED);
  if (productionIntent && unset && !anyWrite) {
    r.FINANCE_REPORTING_SOURCE_MODE = "production_read_only";
  }
  return r;
}

const envObjectSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: appEnvSchema.default("development"),
    NEXT_PUBLIC_APP_ENV: appEnvSchema.default("development"),
    NEXT_PUBLIC_APP_NAME: z.string().default("Touri Taxi Admin Next"),
    /** mock = development only; verified_token required for staging/production */
    AUTH_MODE: z.enum(["mock", "verified_token"]).default("mock"),
    SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(480),
    /** Hard cap for list/read pagination — unbounded reads forbidden */
    MAX_PAGE_SIZE: z.coerce.number().int().positive().max(500).default(100),
    /**
     * Phase 4 design: disabled | shadow only (no write mode).
     * Defaults to disabled — never couples to write flags.
     */
    PRODUCTION_READ_MODE: z.enum(["disabled", "shadow"]).default("disabled"),
    /** Environment fingerprint — required when evaluating Production read gates. */
    EXPECTED_PROJECT_ID: z.string().default(""),
    EXPECTED_ENVIRONMENT: z
      .enum(["development", "staging", "production"])
      .default("development"),
    PRODUCTION_READ_ENABLED: boolFromEnv,
    PRODUCTION_WRITE_ENABLED: boolFromEnv,
    GLOBAL_PRODUCTION_WRITE_ENABLED: boolFromEnv,
    FINANCE_WRITE_ENABLED: boolFromEnv,
    /**
     * FR7 reporting source: synthetic (golden/tests) | production_read_only (Firestore RO).
     * Non-prod default synthetic; Production unset arms production_read_only (preprocess).
     */
    FINANCE_REPORTING_SOURCE_MODE: z
      .enum(["synthetic", "production_read_only", "test"])
      .default("synthetic"),
    DRIVER_WRITE_ENABLED: boolFromEnv,
    AGENT_WRITE_ENABLED: boolFromEnv,
    CUSTOMER_WRITE_ENABLED: boolFromEnv,
    /** Customer Auth dual-write — MUST remain false until dedicated approval. */
    CUSTOMER_AUTH_WRITE_ENABLED: boolFromEnv,
    /**
     * Geography mutations — gated controlled create/update/activate/deactivate.
     * MUST remain false; no CP5 auto-cleanup.
     */
    GEOGRAPHY_WRITE_ENABLED: boolFromEnv,
    /**
     * Narrow P0 region writes (`cities` collection as regions).
     * MUST remain false until synthetic pilot.
     */
    REGION_WRITE_ENABLED: boolFromEnv,
    /**
     * Vehicle master `type_car` controlled writes. MUST remain false.
     */
    VEHICLE_CATALOG_WRITE_ENABLED: boolFromEnv,
    /**
     * Partner landmark (isShrek) controlled writes. MUST remain false.
     */
    PARTNER_WRITE_ENABLED: boolFromEnv,
    /**
     * Fleet / transport_company controlled writes. MUST remain false.
     */
    FLEET_WRITE_ENABLED: boolFromEnv,
    /**
     * Tour guide soft-status writes. MUST remain false.
     */
    GUIDE_WRITE_ENABLED: boolFromEnv,
    /**
     * Admin identity / role / scope mutations (Firestore persona → CF claims sync).
     * MUST remain false until dedicated identity-admin WIF SA is armed.
     */
    ADMIN_IDENTITY_WRITE_ENABLED: boolFromEnv,
    /**
     * Full PII reveal in shadow — MUST remain false in 4A-0..4A-7.
     * Even with customers:read_pii, full reveal is trapped when false.
     */
    FULL_PII_SHADOW_ENABLED: boolFromEnv,
    /**
     * Phase 4A-1: comma-separated live resources. Controlled window = "countries".
     * Empty when Production read disabled.
     */
    LIVE_SHADOW_ALLOWED_RESOURCES: z.string().default(""),
    /**
     * Observability sink for live attempts.
     * memory = unit/default; structured_logger | file_ndjson required when read enabled.
     */
    PRODUCTION_READ_OBSERVABILITY_SINK: z
      .enum(["memory", "structured_logger", "file_ndjson"])
      .default("memory"),
    /** Absolute or repo-relative path for file_ndjson (must be gitignored under .local/). */
    PRODUCTION_READ_OBSERVABILITY_FILE: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    const isNonProd = data.APP_ENV !== "production" || data.NODE_ENV === "development";
    const writeFlags = [
      ["PRODUCTION_WRITE_ENABLED", data.PRODUCTION_WRITE_ENABLED],
      ["GLOBAL_PRODUCTION_WRITE_ENABLED", data.GLOBAL_PRODUCTION_WRITE_ENABLED],
      ["FINANCE_WRITE_ENABLED", data.FINANCE_WRITE_ENABLED],
      ["DRIVER_WRITE_ENABLED", data.DRIVER_WRITE_ENABLED],
      ["AGENT_WRITE_ENABLED", data.AGENT_WRITE_ENABLED],
      ["CUSTOMER_WRITE_ENABLED", data.CUSTOMER_WRITE_ENABLED],
      ["CUSTOMER_AUTH_WRITE_ENABLED", data.CUSTOMER_AUTH_WRITE_ENABLED],
      ["GEOGRAPHY_WRITE_ENABLED", data.GEOGRAPHY_WRITE_ENABLED],
      ["REGION_WRITE_ENABLED", data.REGION_WRITE_ENABLED],
      ["VEHICLE_CATALOG_WRITE_ENABLED", data.VEHICLE_CATALOG_WRITE_ENABLED],
      ["PARTNER_WRITE_ENABLED", data.PARTNER_WRITE_ENABLED],
      ["FLEET_WRITE_ENABLED", data.FLEET_WRITE_ENABLED],
      ["GUIDE_WRITE_ENABLED", data.GUIDE_WRITE_ENABLED],
      ["ADMIN_IDENTITY_WRITE_ENABLED", data.ADMIN_IDENTITY_WRITE_ENABLED],
    ] as const;

    for (const [name, enabled] of writeFlags) {
      if (enabled && isNonProd) {
        ctx.addIssue({
          code: "custom",
          message: `Dangerous flag ${name}=true is forbidden in non-production / development startup.`,
          path: [name],
        });
      }
    }

    // Read mode must never imply write; shadow forbids any write flag true.
    if (data.PRODUCTION_READ_MODE === "shadow") {
      for (const [name, enabled] of writeFlags) {
        if (enabled) {
          ctx.addIssue({
            code: "custom",
            message: `${name}=true is forbidden while PRODUCTION_READ_MODE=shadow`,
            path: [name],
          });
        }
      }
    }

    if (data.FINANCE_REPORTING_SOURCE_MODE === "production_read_only") {
      for (const [name, enabled] of writeFlags) {
        if (enabled) {
          ctx.addIssue({
            code: "custom",
            message: `${name}=true is forbidden while FINANCE_REPORTING_SOURCE_MODE=production_read_only`,
            path: [name],
          });
        }
      }
    }

    try {
      assertAuthModeAllowed({
        APP_ENV: data.APP_ENV,
        AUTH_MODE: data.AUTH_MODE,
        NODE_ENV: data.NODE_ENV,
      });
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: err instanceof Error ? err.message : String(err),
        path: ["AUTH_MODE"],
      });
    }

    try {
      assertLiveShadowStartupOrThrow(data);
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: err instanceof Error ? err.message : String(err),
        path: ["PRODUCTION_READ_ENABLED"],
      });
    }

    try {
      assertFinanceReportingStartupOrThrow(data);
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: err instanceof Error ? err.message : String(err),
        path: ["FINANCE_REPORTING_SOURCE_MODE"],
      });
    }
  });

export const envSchema = z.preprocess(
  withProductionFinanceSourceDefault,
  envObjectSchema,
);

export type AppEnvConfig = z.infer<typeof envObjectSchema>;

let cachedEnv: AppEnvConfig | null = null;

function readRawEnv(): Record<string, unknown> {
  const appEnv =
    process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  const expectedEnvironment =
    process.env.EXPECTED_ENVIRONMENT ??
    process.env.APP_ENV ??
    process.env.NEXT_PUBLIC_APP_ENV ??
    "development";
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const productionIntent =
    appEnv === "production" ||
    (expectedEnvironment === "production" && nodeEnv === "production");
  const financeModeExplicit = process.env.FINANCE_REPORTING_SOURCE_MODE;
  const truthy = (v: string | undefined) => {
    const n = String(v ?? "")
      .trim()
      .toLowerCase();
    return n === "1" || n === "true" || n === "yes" || n === "on";
  };
    const anyWrite =
    truthy(process.env.PRODUCTION_WRITE_ENABLED) ||
    truthy(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED) ||
    truthy(process.env.FINANCE_WRITE_ENABLED) ||
    truthy(process.env.DRIVER_WRITE_ENABLED) ||
    truthy(process.env.AGENT_WRITE_ENABLED) ||
    truthy(process.env.CUSTOMER_WRITE_ENABLED) ||
    truthy(process.env.CUSTOMER_AUTH_WRITE_ENABLED) ||
    truthy(process.env.GEOGRAPHY_WRITE_ENABLED) ||
    truthy(process.env.REGION_WRITE_ENABLED) ||
    truthy(process.env.VEHICLE_CATALOG_WRITE_ENABLED) ||
    truthy(process.env.PARTNER_WRITE_ENABLED) ||
    truthy(process.env.FLEET_WRITE_ENABLED) ||
    truthy(process.env.GUIDE_WRITE_ENABLED) ||
    truthy(process.env.ADMIN_IDENTITY_WRITE_ENABLED);
  return {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "development",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    AUTH_MODE: process.env.AUTH_MODE ?? "mock",
    SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES,
    MAX_PAGE_SIZE: process.env.MAX_PAGE_SIZE ?? "100",
    PRODUCTION_READ_MODE: process.env.PRODUCTION_READ_MODE ?? "disabled",
    EXPECTED_PROJECT_ID: process.env.EXPECTED_PROJECT_ID ?? "",
    EXPECTED_ENVIRONMENT: expectedEnvironment,
    PRODUCTION_READ_ENABLED: process.env.PRODUCTION_READ_ENABLED ?? "false",
    PRODUCTION_WRITE_ENABLED: process.env.PRODUCTION_WRITE_ENABLED ?? "false",
    GLOBAL_PRODUCTION_WRITE_ENABLED:
      process.env.GLOBAL_PRODUCTION_WRITE_ENABLED ?? "false",
    FINANCE_WRITE_ENABLED: process.env.FINANCE_WRITE_ENABLED ?? "false",
    // Wire through raw env — Production unset + writes false → production_read_only
    FINANCE_REPORTING_SOURCE_MODE:
      financeModeExplicit ??
      (productionIntent && !anyWrite ? "production_read_only" : "synthetic"),
    DRIVER_WRITE_ENABLED: process.env.DRIVER_WRITE_ENABLED ?? "false",
    AGENT_WRITE_ENABLED: process.env.AGENT_WRITE_ENABLED ?? "false",
    CUSTOMER_WRITE_ENABLED: process.env.CUSTOMER_WRITE_ENABLED ?? "false",
    CUSTOMER_AUTH_WRITE_ENABLED:
      process.env.CUSTOMER_AUTH_WRITE_ENABLED ?? "false",
    GEOGRAPHY_WRITE_ENABLED: process.env.GEOGRAPHY_WRITE_ENABLED ?? "false",
    REGION_WRITE_ENABLED: process.env.REGION_WRITE_ENABLED ?? "false",
    VEHICLE_CATALOG_WRITE_ENABLED:
      process.env.VEHICLE_CATALOG_WRITE_ENABLED ?? "false",
    PARTNER_WRITE_ENABLED: process.env.PARTNER_WRITE_ENABLED ?? "false",
    FLEET_WRITE_ENABLED: process.env.FLEET_WRITE_ENABLED ?? "false",
    GUIDE_WRITE_ENABLED: process.env.GUIDE_WRITE_ENABLED ?? "false",
    ADMIN_IDENTITY_WRITE_ENABLED:
      process.env.ADMIN_IDENTITY_WRITE_ENABLED ?? "false",
    FULL_PII_SHADOW_ENABLED: process.env.FULL_PII_SHADOW_ENABLED ?? "false",
    LIVE_SHADOW_ALLOWED_RESOURCES:
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES ?? "",
    PRODUCTION_READ_OBSERVABILITY_SINK:
      process.env.PRODUCTION_READ_OBSERVABILITY_SINK ?? "memory",
    PRODUCTION_READ_OBSERVABILITY_FILE:
      process.env.PRODUCTION_READ_OBSERVABILITY_FILE ?? "",
  };
}

export function loadEnv(raw: Record<string, unknown> = readRawEnv()): AppEnvConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Environment validation failed: ${details}`);
  }
  return parsed.data;
}

export function getEnv(): AppEnvConfig {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function areProductionWritesEffectivelyEnabled(env: AppEnvConfig = getEnv()): boolean {
  return (
    env.PRODUCTION_WRITE_ENABLED &&
    env.GLOBAL_PRODUCTION_WRITE_ENABLED &&
    (env.FINANCE_WRITE_ENABLED ||
      env.DRIVER_WRITE_ENABLED ||
      env.AGENT_WRITE_ENABLED ||
      env.CUSTOMER_WRITE_ENABLED)
  );
}

export const SAFETY_FLAGS_DEFAULT_FALSE = [
  "PRODUCTION_READ_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "GEOGRAPHY_WRITE_ENABLED",
  "REGION_WRITE_ENABLED",
  "VEHICLE_CATALOG_WRITE_ENABLED",
  "PARTNER_WRITE_ENABLED",
  "FLEET_WRITE_ENABLED",
  "GUIDE_WRITE_ENABLED",
  "ADMIN_IDENTITY_WRITE_ENABLED",
  "FULL_PII_SHADOW_ENABLED",
] as const;

/**
 * Phase 4A-0 — shared shadow-capable API helpers.
 * Production path remains DISABLED by default.
 * Synthetic routes continue in development and MUST NOT use Production repositories.
 */

import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import {
  shadowTrapForRequest,
} from "@/infrastructure/production/shadow/ShadowTraps";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";

export function productionReadPathActive(): boolean {
  const env = getEnv();
  return (
    env.PRODUCTION_READ_ENABLED === true &&
    env.PRODUCTION_READ_MODE === "shadow"
  );
}

/**
 * Apply shadow traps for mutation / export / settlement.
 * Returns a Response when denied; null when allowed to continue.
 */
export function maybeShadowTrapResponse(
  request: Request,
): NextResponse | null {
  const env = getEnv();
  const url = new URL(request.url);
  const trap = shadowTrapForRequest({
    method: request.method,
    path: url.pathname,
    productionReadMode: env.PRODUCTION_READ_MODE,
    // Synthetic mutations remain available only in development with read disabled
    allowSyntheticMutations:
      env.APP_ENV === "development" && env.PRODUCTION_READ_MODE === "disabled",
  });
  if (trap.action === "deny") {
    return NextResponse.json(
      { error: trap.code, code: trap.code },
      { status: trap.status },
    );
  }
  return null;
}

export function productionReadDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Production read is disabled",
      code: "PRODUCTION_READ_DISABLED",
    },
    { status: 503 },
  );
}

export function mapProductionReadError(error: unknown): NextResponse {
  if (error instanceof ProductionReadDisabledError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 503 },
    );
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : null;
  const message =
    error instanceof Error ? error.message : "Internal error";
  if (code === "SCOPE_DENIED" || code === "SCOPE_EXPANSION_DENIED") {
    return NextResponse.json(
      { error: "Scope denied", code: "SCOPE_DENIED" },
      { status: 403 },
    );
  }
  if (code === "FULL_PII_SHADOW_DISABLED") {
    return NextResponse.json(
      { error: "Full PII disabled in shadow", code },
      { status: 403 },
    );
  }
  if (code === "INVALID_QUERY_LIMIT" || code === "COLLECTION_NOT_ALLOWED") {
    return NextResponse.json(
      { error: code, code },
      { status: 400 },
    );
  }
  if (code === "LIVE_RESOURCE_NOT_ENABLED") {
    return NextResponse.json(
      { error: "Live shadow resource not enabled", code },
      { status: 403 },
    );
  }
  if (
    code === "WIF_CONFIG_INCOMPLETE" ||
    code === "WIF_TOKEN_MISSING" ||
    code === "WIF_ADC_MISSING" ||
    code === "WIF_CREDENTIALS_INVALID" ||
    code === "FR7_WIF_CONFIG_INCOMPLETE" ||
    code === "FR7_WIF_TOKEN_MISSING" ||
    code === "FR7_ADC_MISSING" ||
    /PRODUCTION_READ_DISABLED|EXPECTED_PROJECT_ID|WIF_CONFIG/i.test(message)
  ) {
    return NextResponse.json(
      {
        error: "Production data unavailable",
        code: code ?? "PRODUCTION_DATA_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Internal error", code: "INTERNAL" },
    { status: 500 },
  );
}

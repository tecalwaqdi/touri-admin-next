/**
 * FR7 FinanceReportingReadService factory for Admin Next API routes.
 *
 * Mode (env/config only — no UI switches):
 * - synthetic / test → golden FR7 bundle (tests + local default)
 * - production_read_only → Production RO adapters → Firestore
 *
 * Architecture:
 * UI → /api/finance/* → FinanceReportingReadService → SourcePort → Firestore
 *
 * Production writes = 0. No Presentation Firestore. No generic query API.
 */

import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
import {
  resolveFinanceReportingSourceMode,
  type FinanceReportingSourceMode,
} from "@/application/finance/reporting/FinanceReportingSourceMode";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { SyntheticFinanceReportingSourceAdapter } from "@/adapters/finance/reporting/SyntheticFinanceReportingSourceAdapter";
import { createProductionFinanceReportingReadAdapter } from "@/adapters/finance/reporting/ProductionFinanceReportingReadAdapter";
import type { FinanceReportingSourcePort } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import type { FinanceReportingDimensionFilters } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  canonicalizeCountryIdList,
  InvalidCountryIdError,
  requireCanonicalCountryId,
  tryCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

let cached: FinanceReportingReadService | null = null;
let cachedAt = 0;
let cachedMode: FinanceReportingSourceMode | null = null;
let lastLoadMeta: {
  mode: FinanceReportingSourceMode;
  productionReads: number;
  productionWrites: 0;
  firestoreMutations: 0;
} | null = null;

/** Optional test injection for Production RO port. */
let testSourcePort: FinanceReportingSourcePort | null = null;

export function setFinanceReportingSourcePortForTests(
  port: FinanceReportingSourcePort | null,
): void {
  testSourcePort = port;
  cached = null;
  cachedMode = null;
  lastLoadMeta = null;
}

async function resolveSourcePort(
  mode: FinanceReportingSourceMode,
): Promise<FinanceReportingSourcePort> {
  if (testSourcePort) return testSourcePort;
  if (mode === "production_read_only") {
    return createProductionFinanceReportingReadAdapter();
  }
  return new SyntheticFinanceReportingSourceAdapter();
}

/**
 * Returns FR7 read service for the configured source mode.
 * Golden/synthetic is default; Production UI uses production_read_only.
 */
export async function getFinanceReportingReadService(): Promise<FinanceReportingReadService> {
  const mode = resolveFinanceReportingSourceMode();
  if (cached && cachedMode === mode && (mode !== "production_read_only" || Date.now() - cachedAt < 30_000)) {
    return cached;
  }
  const port = await resolveSourcePort(mode);
  const loaded = await port.load();
  cached = new FinanceReportingReadService(loaded.bundle);
  cachedMode = mode;
  cachedAt = Date.now();
  lastLoadMeta = {
    mode: loaded.mode,
    productionReads: loaded.productionReads,
    productionWrites: 0,
    firestoreMutations: 0,
  };
  return cached;
}

/** Sync helper for unit tests that always use golden/synthetic. */
export function getFinanceReportingReadServiceSyncForTests(): FinanceReportingReadService {
  if (!cached || cachedMode !== "synthetic") {
    cached = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    cachedMode = "synthetic";
    lastLoadMeta = {
      mode: "synthetic",
      productionReads: 0,
      productionWrites: 0,
      firestoreMutations: 0,
    };
  }
  return cached;
}

export function getLastFinanceReportingLoadMetaForTests(): typeof lastLoadMeta {
  return lastLoadMeta;
}

/** Test helper — reset cached service. */
export function resetFinanceReportingReadServiceForTests(): void {
  cached = null;
  cachedMode = null;
  lastLoadMeta = null;
  testSourcePort = null;
}

export function toFinanceReportingActor(
  ctx: ApiActorContext,
): FinanceReportingActor {
  const scope = { ...ctx.user.scope };
  if (scope.countryIds?.length) {
    scope.countryIds = canonicalizeCountryIdList(scope.countryIds);
  }
  return {
    userId: ctx.user.id,
    role: ctx.user.role,
    permissions: ctx.user.permissions,
    scope,
  };
}

export function parseFinanceFilters(
  searchParams: URLSearchParams,
): FinanceReportingDimensionFilters {
  const rawCountry = searchParams.get("countryId");
  let countryId: string | null = null;
  if (rawCountry != null && rawCountry.trim() !== "") {
    countryId = requireCanonicalCountryId(rawCountry);
  }
  return {
    countryId,
    agentId: searchParams.get("agentId"),
    driverId: searchParams.get("driverId"),
    currency: searchParams.get("currency") ?? searchParams.get("currencyCode"),
    paymentMethod: (searchParams.get("paymentMethod") as
      | "cash"
      | "card"
      | "unknown"
      | null) ?? null,
    settlementStatus: searchParams.get("settlementStatus") as never,
    settlementDirection: searchParams.get("settlementDirection") as never,
    periodFromUtc: searchParams.get("from") ?? searchParams.get("periodFromUtc"),
    periodToUtc: searchParams.get("to") ?? searchParams.get("periodToUtc"),
  };
}

export function mapFinanceApiError(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof InvalidCountryIdError) {
    return {
      status: 403,
      body: { error: error.message, code: "SCOPE_DENIED" },
    };
  }
  const message = error instanceof Error ? error.message : "error";
  if (message.startsWith("validation_failed:")) return { status: 400, body: { error: message.slice(18), code: "VALIDATION_FAILED" } };
  if (message.startsWith("invalid_country_id:")) {
    return {
      status: 403,
      body: { error: message, code: "SCOPE_DENIED" },
    };
  }
  if (message.startsWith("rbac_denied:")) {
    return {
      status: 403,
      body: { error: message, code: "FORBIDDEN" },
    };
  }
  if (
    message.startsWith("cross_country_denied:") ||
    message.startsWith("scope_denied:")
  ) {
    return {
      status: 403,
      body: { error: message, code: "SCOPE_DENIED" },
    };
  }
  return {
    status: 500,
    body: { error: message, code: "INTERNAL" },
  };
}

export { tryCanonicalCountryId, requireCanonicalCountryId };

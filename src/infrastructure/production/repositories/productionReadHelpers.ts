/**
 * Phase 4A-0 — shared helpers for Production read repositories.
 */

import {
  DATA_SOURCE_IDENTITY,
  DEFAULT_MAX_PAGE_SIZE,
  LEGACY_MAPPING_VERSION,
  SOURCE_SCHEMA_VERSION_UNKNOWN,
} from "@/domain/production-read/constants";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type { ReadSafetyLevel } from "@/domain/read/ReadQuery";
import { assertProductionReadEnabled } from "@/infrastructure/production/ProductionReadGate";
import {
  assertCursorPagination,
  resolveTripDateWindow,
} from "@/infrastructure/production/contracts/QuerySafety";
import { InvalidQueryLimitError } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { CursorPageRequest } from "@/domain/read/ReadQuery";
import { enforceReadScope } from "@/infrastructure/production/contracts/ScopeExpansionGuard";
import {
  assertLiveShadowResourceAllowed,
  type LiveShadowResource,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  countryIdsEqual,
  tryCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

export class ScopeDeniedError extends Error {
  readonly code = "SCOPE_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "ScopeDeniedError";
  }
}

export class FullPiiShadowDisabledError extends Error {
  readonly code = "FULL_PII_SHADOW_DISABLED";
  constructor(
    message = "FULL_PII_SHADOW_ENABLED=false — full PII reveal denied in shadow",
  ) {
    super(message);
    this.name = "FullPiiShadowDisabledError";
  }
}

export function enforceKillSwitch(enabled: boolean): void {
  assertProductionReadEnabled(enabled);
}

/**
 * Optional Phase 4A-1 live allowlist. When `allowed` is undefined, skip
 * (unit tests / Fake paths). When provided, deny non-allowlisted resources.
 */
export function enforceLiveShadowResource(
  allowed: ReadonlySet<string> | undefined,
  resource: LiveShadowResource | string,
): void {
  if (allowed == null) return;
  assertLiveShadowResourceAllowed(allowed, resource);
}

export function assertPageLimit(
  page: Partial<CursorPageRequest> | null | undefined,
  maxPageSize: number = DEFAULT_MAX_PAGE_SIZE,
): CursorPageRequest {
  try {
    return assertCursorPagination(page, maxPageSize);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/exceeds MAX_PAGE_SIZE|must be positive|required/i.test(msg)) {
      throw new InvalidQueryLimitError(msg);
    }
    throw err;
  }
}

export function intersectScopeOrThrow(
  ctx: ProductionReadContext,
  clientHint?: {
    countryIds?: string[];
    cityIds?: string[];
    agentIds?: string[];
  },
): {
  countryIds?: string[];
  cityIds?: string[];
  agentIds?: string[];
} {
  const result = enforceReadScope({
    actorScope: ctx.scope,
    clientHint: {
      countryIds: clientHint?.countryIds ?? ctx.serverScopeFilter.countryIds,
      cityIds: clientHint?.cityIds ?? ctx.serverScopeFilter.cityIds,
      agentIds: clientHint?.agentIds ?? ctx.serverScopeFilter.agentIds,
    },
  });
  if (!result.ok) {
    throw new ScopeDeniedError(result.reason);
  }
  return {
    countryIds: result.serverFilter.countryIds,
    cityIds: result.serverFilter.cityIds,
    agentIds: result.serverFilter.agentIds,
  };
}

/** Canonical country membership for detail getById IDOR checks. */
export function isCountryInScopedList(
  scopedCountryIds: string[] | undefined,
  resourceCountryId: string | null | undefined,
): boolean {
  if (!scopedCountryIds?.length) return true;
  if (!resourceCountryId) return false;
  return scopedCountryIds.some((id) =>
    countryIdsEqual(id, resourceCountryId),
  );
}

/**
 * Geography list/filter match — accepts aliases (SA ≡ saudi_arabia ≡ demo_saudi)
 * against any of countryId / canonicalCountryId / sourceCountryDocumentId.
 */
export function matchesGeographyCountryFilter(
  filterCountryId: string | null | undefined,
  row: {
    countryId?: string | null;
    canonicalCountryId?: string | null;
    sourceCountryDocumentId?: string | null;
  },
): boolean {
  if (filterCountryId == null || !String(filterCountryId).trim()) return true;
  const filter = String(filterCountryId).trim();
  const candidates = [
    row.canonicalCountryId,
    row.countryId,
    row.sourceCountryDocumentId,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === filter) return true;
    if (countryIdsEqual(candidate, filter)) return true;
  }
  const filterCanonical = tryCanonicalCountryId(filter);
  if (filterCanonical) {
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (tryCanonicalCountryId(candidate) === filterCanonical) return true;
    }
  }
  return false;
}

export function envelopeOf<T>(
  ctx: ProductionReadContext,
  data: T,
  extras: {
    mappingWarnings?: MappingWarning[];
    mappingConfidence?: MappingConfidence;
    sourceVersion?: string | null;
    sourceSchemaVersion?: string;
    readSafety?: ReadSafetyLevel;
    blockedFields?: string[];
    piiRedacted?: boolean;
  } = {},
): ProductionReadEnvelope<T> {
  return {
    data,
    meta: {
      ...DATA_SOURCE_IDENTITY,
      mappingWarnings: extras.mappingWarnings ?? [],
      mappingConfidence: extras.mappingConfidence ?? "medium",
      mappingVersion: LEGACY_MAPPING_VERSION,
      sourceVersion: extras.sourceVersion ?? null,
      sourceSchemaVersion:
        extras.sourceSchemaVersion ?? SOURCE_SCHEMA_VERSION_UNKNOWN,
      readSafety: extras.readSafety ?? "SAFE",
      blockedFields: extras.blockedFields ?? [],
      piiRedacted: extras.piiRedacted ?? true,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
    },
  };
}

export { resolveTripDateWindow };

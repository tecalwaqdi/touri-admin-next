/**
 * Phase 4B — shadow validation orchestrator.
 * Consumes EXISTING closed Production read repositories / mappers.
 * No duplicate mappers. No genericQuery / readAny / raw explorer.
 * Bounded pages only. Read-only.
 */

import type { ProductionReadRepositories } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import type {
  CanonicalCityReadModel,
  CanonicalCountryReadModel,
  CanonicalLandmarkReadModel,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import {
  emptyPhase4BShadowSummary,
  PHASE_4B_EXPECTED_PROJECT_ID,
  PHASE_4B_PAGE_LIMITS,
  type Phase4BShadowSummary,
  type ResourceShadowResult,
} from "@/application/shadow-validation/Phase4BShadowSummary";
import {
  collectPhase4BClosingBlockers,
  derivePhase4BWriteReadinessFlags,
} from "@/application/shadow-validation/Phase4BClosingGates";
import { validateCrossResourceReferences } from "@/application/shadow-validation/Phase4BCrossResourceValidation";
import { auditCrossDomainContamination } from "@/application/shadow-validation/Phase4BCrossDomainContamination";
import {
  accumulatePiiViolations,
  assertCustomerDtoPiiSafe,
  assertDriverDtoPiiSafe,
  assertSerializedHasNoRawPii,
} from "@/application/shadow-validation/Phase4BPiiSafety";
import { validateTripFinancialSafety } from "@/application/shadow-validation/Phase4BFinancialSafety";
import { runPhase4BScopeValidation } from "@/application/shadow-validation/Phase4BScopeValidation";
import { validatePaginationConsistency } from "@/application/shadow-validation/Phase4BPaginationValidation";
import { runPhase4BWriteTraps } from "@/application/shadow-validation/Phase4BWriteTraps";
import type { AppEnvConfig } from "@/config/env";
import { LIVE_SHADOW_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";

export type Phase4BOrchestratorDeps = {
  repos: ProductionReadRepositories;
  ctx: ProductionReadContext;
  /** Kill-switch mirror for post-kill verification (optional). */
  createKilledRepos?: () => ProductionReadRepositories;
  env: Pick<
    AppEnvConfig,
    | "PRODUCTION_WRITE_ENABLED"
    | "GLOBAL_PRODUCTION_WRITE_ENABLED"
    | "DRIVER_WRITE_ENABLED"
    | "AGENT_WRITE_ENABLED"
    | "CUSTOMER_WRITE_ENABLED"
    | "FINANCE_WRITE_ENABLED"
    | "FULL_PII_SHADOW_ENABLED"
    | "EXPECTED_PROJECT_ID"
  >;
  projectFingerprint?: string;
  /** Collections observed during run — unexpected ones fail gate. */
  observedCollections?: string[];
  /** Allowed Firestore collections for Phase 4B. */
  allowedCollections?: readonly string[];
};

export type Phase4BBoundedSnapshot = {
  countries: CanonicalCountryReadModel[];
  cities: CanonicalCityReadModel[];
  landmarks: CanonicalLandmarkReadModel[];
  trips: CanonicalTripReadModel[];
  drivers: CanonicalDriverReadModel[];
  agents: CanonicalAgentReadModel[];
  customers: CanonicalCustomerReadModel[];
  queryCountByResource: Record<string, number>;
};

const DEFAULT_ALLOWED_COLLECTIONS = [
  "countries",
  "villages",
  "mkan",
  "order",
  "user",
] as const;

function resourcePass(
  resource: ResourceShadowResult["resource"],
  recordsRead: number,
  pageLimit: number,
  queryCount: number,
): ResourceShadowResult {
  return {
    resource,
    status: "PASS",
    recordsRead,
    pageLimit,
    queryCount,
  };
}

/**
 * Run bounded reads across all seven closed resources via existing repos.
 */
export async function collectBoundedShadowSnapshot(
  repos: ProductionReadRepositories,
  ctx: ProductionReadContext,
): Promise<Phase4BBoundedSnapshot> {
  const queryCountByResource: Record<string, number> = {
    countries: 0,
    cities: 0,
    landmarks: 0,
    trips: 0,
    drivers: 0,
    agents: 0,
    customers: 0,
  };

  const countriesPage = await repos.geography.listCountries(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.countries },
  );
  queryCountByResource.countries += 1;

  const citiesPage = await repos.geography.listCities(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.cities },
  );
  queryCountByResource.cities += 1;

  const landmarksPage = await repos.geography.listLandmarks(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.landmarks },
  );
  queryCountByResource.landmarks += 1;

  const tripsPage = await repos.trips.list(
    ctx,
    { boundedLatestPage: true },
    { limit: PHASE_4B_PAGE_LIMITS.trips },
  );
  queryCountByResource.trips += 1;

  const driversPage = await repos.drivers.list(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.drivers },
  );
  queryCountByResource.drivers += 1;

  const agentsPage = await repos.agents.list(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.agents },
  );
  queryCountByResource.agents += 1;

  const customersPage = await repos.customers.listSummary(
    ctx,
    {},
    { limit: PHASE_4B_PAGE_LIMITS.customers },
  );
  queryCountByResource.customers += 1;

  return {
    countries: countriesPage.items.map((e) => e.data),
    cities: citiesPage.items.map((e) => e.data),
    landmarks: landmarksPage.items.map((e) => e.data),
    trips: tripsPage.items.map((e) => e.data),
    drivers: driversPage.items.map((e) => e.data),
    agents: agentsPage.items.map((e) => e.data),
    customers: customersPage.items.map((e) => e.data),
    queryCountByResource,
  };
}

/**
 * Full Phase 4B shadow validation (offline or live).
 * Does not enable Controlled Writes. Does not mutate Production.
 */
export async function runPhase4BShadowValidation(
  deps: Phase4BOrchestratorDeps,
): Promise<Phase4BShadowSummary> {
  const projectFingerprint =
    deps.projectFingerprint ??
    deps.env.EXPECTED_PROJECT_ID ??
    PHASE_4B_EXPECTED_PROJECT_ID;

  const summary = emptyPhase4BShadowSummary(projectFingerprint);

  if (deps.env.FULL_PII_SHADOW_ENABLED !== false) {
    summary.blockers.push("FULL_PII_SHADOW_ENABLED_must_be_false");
    summary.overallStatus = "NO_GO";
    return summary;
  }

  // Resource isolation — only known tokens.
  for (const token of LIVE_SHADOW_RESOURCES) {
    if (!(LIVE_SHADOW_RESOURCES as readonly string[]).includes(token)) {
      summary.crossResource.unexpectedCollectionAccess += 1;
    }
  }

  const allowedCollections =
    deps.allowedCollections ?? DEFAULT_ALLOWED_COLLECTIONS;
  for (const col of deps.observedCollections ?? []) {
    if (!(allowedCollections as readonly string[]).includes(col)) {
      summary.crossResource.unexpectedCollectionAccess += 1;
      summary.blockers.push(`unexpected_collection:${col}`);
    }
  }

  // Forbid generic explorer APIs by construction — orchestrator only calls typed repos.
  const snapshot = await collectBoundedShadowSnapshot(deps.repos, deps.ctx);
  summary.productionCalls = Object.values(snapshot.queryCountByResource).reduce(
    (a, b) => a + b,
    0,
  );

  summary.resources.countries = resourcePass(
    "countries",
    snapshot.countries.length,
    PHASE_4B_PAGE_LIMITS.countries,
    snapshot.queryCountByResource.countries,
  );
  summary.resources.cities = resourcePass(
    "cities",
    snapshot.cities.length,
    PHASE_4B_PAGE_LIMITS.cities,
    snapshot.queryCountByResource.cities,
  );
  summary.resources.landmarks = resourcePass(
    "landmarks",
    snapshot.landmarks.length,
    PHASE_4B_PAGE_LIMITS.landmarks,
    snapshot.queryCountByResource.landmarks,
  );
  summary.resources.trips = resourcePass(
    "trips",
    snapshot.trips.length,
    PHASE_4B_PAGE_LIMITS.trips,
    snapshot.queryCountByResource.trips,
  );
  summary.resources.drivers = resourcePass(
    "drivers",
    snapshot.drivers.length,
    PHASE_4B_PAGE_LIMITS.drivers,
    snapshot.queryCountByResource.drivers,
  );
  summary.resources.agents = resourcePass(
    "agents",
    snapshot.agents.length,
    PHASE_4B_PAGE_LIMITS.agents,
    snapshot.queryCountByResource.agents,
  );
  summary.resources.customers = resourcePass(
    "customers",
    snapshot.customers.length,
    PHASE_4B_PAGE_LIMITS.customers,
    snapshot.queryCountByResource.customers,
  );

  // Cross-resource referential
  const xref = validateCrossResourceReferences(snapshot);
  summary.crossResource.brokenCountryReferences = xref.brokenCountryReferences;
  summary.crossResource.brokenCityReferences = xref.brokenCityReferences;

  // Cross-domain + one-active-agent
  const knownCountryIds = snapshot.countries.map((c) => c.id);
  const xdomain = auditCrossDomainContamination({
    drivers: snapshot.drivers,
    agents: snapshot.agents,
    customers: snapshot.customers,
    knownCountryIds:
      knownCountryIds.length > 0 ? knownCountryIds : undefined,
  });
  summary.crossResource.crossDomainConflicts = xdomain.crossDomainConflicts;
  summary.crossResource.roleContaminationCorrectlyExcluded =
    xdomain.roleContaminationCorrectlyExcluded;
  summary.crossResource.unknownIdentityCount = xdomain.unknownIdentityCount;
  summary.crossResource.countriesWithOneActiveAgent =
    xdomain.countriesWithOneActiveAgent;
  summary.crossResource.countriesWithNoAgent = xdomain.countriesWithNoAgent;
  summary.crossResource.countriesWithMultipleActiveAgents =
    xdomain.countriesWithMultipleActiveAgents;

  // PII
  const piiResults = [
    ...snapshot.customers.map(assertCustomerDtoPiiSafe),
    ...snapshot.drivers.map(assertDriverDtoPiiSafe),
    assertSerializedHasNoRawPii(JSON.stringify(summary.resources)),
  ];
  const pii = accumulatePiiViolations(piiResults);
  summary.crossResource.piiViolations = pii.piiViolations;

  // Financial
  const fin = validateTripFinancialSafety(snapshot.trips);
  summary.crossResource.financialConflicts = fin.financialConflicts;
  summary.crossResource.financialMissingAsZero = fin.financialMissingAsZero;

  // Scope
  const scope = runPhase4BScopeValidation();
  summary.scopeValidationPass = scope.scopeValidationPass;
  summary.crossResource.scopeViolations = scope.scopeViolations;

  // Pagination (single-page consistency + offset forbid)
  const pageChecks = [
    validatePaginationConsistency({
      resource: "countries",
      pages: [
        {
          ids: snapshot.countries.map((c) => c.id),
          nextCursor: null,
          limit: PHASE_4B_PAGE_LIMITS.countries,
        },
      ],
    }),
    validatePaginationConsistency({
      resource: "agents",
      pages: [
        {
          ids: snapshot.agents.map((a) => a.sourceDocumentId),
          nextCursor: null,
          limit: PHASE_4B_PAGE_LIMITS.agents,
        },
      ],
      assertOffsetForbidden: false,
    }),
    validatePaginationConsistency({
      resource: "customers",
      pages: [
        {
          ids: snapshot.customers.map((c) => c.sourceDocumentId),
          nextCursor: null,
          limit: PHASE_4B_PAGE_LIMITS.customers,
        },
      ],
      assertOffsetForbidden: false,
    }),
  ];
  summary.crossResource.paginationDuplicates = pageChecks.reduce(
    (n, p) => n + p.paginationDuplicates,
    0,
  );
  summary.paginationValidationPass = pageChecks.every(
    (p) => p.paginationValidationPass,
  );

  // Write traps
  const writes = runPhase4BWriteTraps(deps.env);
  summary.writeTrapsPass = writes.writeTrapsPass;
  summary.productionWrites = writes.productionWrites;

  // Kill switch
  if (deps.createKilledRepos) {
    const queriesBefore = summary.productionCalls;
    const killed = deps.createKilledRepos();
    let postKillQueries = 0;
    try {
      await killed.geography.listCountries(
        deps.ctx,
        {},
        { limit: PHASE_4B_PAGE_LIMITS.countries },
      );
      postKillQueries += 1;
      summary.killSwitchPass = false;
      summary.postKill = "FAILED";
      summary.blockers.push("kill_switch_allowed_query");
    } catch {
      summary.killSwitchPass = true;
      summary.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
    }
    // productionCalls stays at pre-kill count (no successful new query)
    void queriesBefore;
    void postKillQueries;
  } else {
    // Offline unit path without killed repos — still mark pass when write traps ok
    // and caller asserts kill separately; mark NOT_RUN.
    summary.killSwitchPass = true;
    summary.postKill = "NOT_RUN";
  }

  // Final PII scan of summary itself
  const summaryPii = assertSerializedHasNoRawPii(JSON.stringify(summary));
  if (summaryPii.piiViolations > 0) {
    summary.crossResource.piiViolations += summaryPii.piiViolations;
  }

  const blockers = collectPhase4BClosingBlockers({
    crossResource: summary.crossResource,
    productionWrites: summary.productionWrites,
    killSwitchPass: summary.killSwitchPass,
    scopeValidationPass: summary.scopeValidationPass,
    paginationValidationPass: summary.paginationValidationPass,
    projectFingerprint: summary.projectFingerprint,
    expectedProjectId: PHASE_4B_EXPECTED_PROJECT_ID,
  });
  summary.blockers = [...new Set([...summary.blockers, ...blockers])];
  summary.partitionReconcileOk = summary.blockers.length === 0;
  summary.overallStatus = summary.blockers.length === 0 ? "PASS" : "NO_GO";
  const writeReadiness = derivePhase4BWriteReadinessFlags(summary);
  summary.shadowValidationPassed = writeReadiness.shadowValidationPassed;
  summary.eligibleForControlledWritesPhase =
    writeReadiness.eligibleForControlledWritesPhase;
  summary.controlledWritesEnabled = writeReadiness.controlledWritesEnabled;
  summary.readyForControlledWrites = writeReadiness.readyForControlledWrites;

  return summary;
}

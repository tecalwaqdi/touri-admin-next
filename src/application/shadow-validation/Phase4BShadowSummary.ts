/**
 * Phase 4B — safe shadow validation summary shape.
 * No raw source documents, tokens, or PII.
 */

import type { LiveShadowResource } from "@/infrastructure/production/contracts/LiveShadowResourceGate";

export type ResourceShadowStatus = "PASS" | "NO_GO" | "SKIPPED" | "PARTIAL";

export type ResourceShadowResult = {
  resource: LiveShadowResource;
  status: ResourceShadowStatus;
  recordsRead: number;
  pageLimit: number;
  queryCount: number;
  mappingNotes?: string[];
  blocker?: string;
};

export type Phase4BCrossResourceCounters = {
  brokenCountryReferences: number;
  brokenCityReferences: number;
  /** Operational identity appearing in multiple domains incorrectly. */
  crossDomainConflicts: number;
  /** Contaminating roles correctly mapped to excluded* statuses. */
  roleContaminationCorrectlyExcluded: number;
  unknownIdentityCount: number;
  countriesWithOneActiveAgent: number;
  countriesWithNoAgent: number;
  countriesWithMultipleActiveAgents: number;
  piiViolations: number;
  financialConflicts: number;
  financialMissingAsZero: number;
  unexpectedCollectionAccess: number;
  scopeViolations: number;
  paginationDuplicates: number;
};

export type Phase4BShadowSummary = {
  overallStatus: "PASS" | "NO_GO";
  projectFingerprint: string;
  resources: {
    countries: ResourceShadowResult;
    cities: ResourceShadowResult;
    landmarks: ResourceShadowResult;
    trips: ResourceShadowResult;
    drivers: ResourceShadowResult;
    agents: ResourceShadowResult;
    customers: ResourceShadowResult;
  };
  crossResource: Phase4BCrossResourceCounters;
  productionCalls: number;
  productionWrites: number;
  partitionReconcileOk: boolean;
  scopeValidationPass: boolean;
  paginationValidationPass: boolean;
  killSwitchPass: boolean;
  writeTrapsPass: boolean;
  fullPiiShadowEnabled: false;
  postKill: "PRODUCTION_READ_DISABLED_NO_NEW_QUERY" | "NOT_RUN" | "FAILED";
  /**
   * True when overallStatus === PASS (Phase 4B shadow validation closed successfully).
   */
  shadowValidationPassed: boolean;
  /**
   * Semantics A — eligible to BEGIN Controlled Writes readiness / architecture work.
   * True after Phase 4B PASS with write traps + kill switch + productionWrites===0.
   * Does NOT mean Production mutations may execute.
   */
  eligibleForControlledWritesPhase: boolean;
  /**
   * Semantics B — write execution activation.
   * Always false until an explicit later Controlled Writes enablement phase.
   * Independent of eligibleForControlledWritesPhase.
   */
  controlledWritesEnabled: boolean;
  /**
   * Alias of eligibleForControlledWritesPhase (A).
   * Historically hard-false to avoid conflating readiness with activation (B).
   * Prefer the explicit fields above.
   */
  readyForControlledWrites: boolean;
  blockers: string[];
};

export const PHASE_4B_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

export const PHASE_4B_SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com" as const;

/** Established 4A page caps — Phase 4B never exceeds these. */
export const PHASE_4B_PAGE_LIMITS = {
  countries: 20,
  cities: 50,
  landmarks: 50,
  trips: 50,
  drivers: 50,
  agents: 50,
  customers: 50,
} as const;

export function emptyResourceResult(
  resource: LiveShadowResource,
  pageLimit: number,
): ResourceShadowResult {
  return {
    resource,
    status: "SKIPPED",
    recordsRead: 0,
    pageLimit,
    queryCount: 0,
  };
}

export function emptyCrossResourceCounters(): Phase4BCrossResourceCounters {
  return {
    brokenCountryReferences: 0,
    brokenCityReferences: 0,
    crossDomainConflicts: 0,
    roleContaminationCorrectlyExcluded: 0,
    unknownIdentityCount: 0,
    countriesWithOneActiveAgent: 0,
    countriesWithNoAgent: 0,
    countriesWithMultipleActiveAgents: 0,
    piiViolations: 0,
    financialConflicts: 0,
    financialMissingAsZero: 0,
    unexpectedCollectionAccess: 0,
    scopeViolations: 0,
    paginationDuplicates: 0,
  };
}

export function emptyPhase4BShadowSummary(
  projectFingerprint: string = PHASE_4B_EXPECTED_PROJECT_ID,
): Phase4BShadowSummary {
  return {
    overallStatus: "NO_GO",
    projectFingerprint,
    resources: {
      countries: emptyResourceResult("countries", PHASE_4B_PAGE_LIMITS.countries),
      cities: emptyResourceResult("cities", PHASE_4B_PAGE_LIMITS.cities),
      landmarks: emptyResourceResult(
        "landmarks",
        PHASE_4B_PAGE_LIMITS.landmarks,
      ),
      trips: emptyResourceResult("trips", PHASE_4B_PAGE_LIMITS.trips),
      drivers: emptyResourceResult("drivers", PHASE_4B_PAGE_LIMITS.drivers),
      agents: emptyResourceResult("agents", PHASE_4B_PAGE_LIMITS.agents),
      customers: emptyResourceResult(
        "customers",
        PHASE_4B_PAGE_LIMITS.customers,
      ),
    },
    crossResource: emptyCrossResourceCounters(),
    productionCalls: 0,
    productionWrites: 0,
    partitionReconcileOk: false,
    scopeValidationPass: false,
    paginationValidationPass: false,
    killSwitchPass: false,
    writeTrapsPass: false,
    fullPiiShadowEnabled: false,
    postKill: "NOT_RUN",
    shadowValidationPassed: false,
    eligibleForControlledWritesPhase: false,
    controlledWritesEnabled: false,
    readyForControlledWrites: false,
    blockers: [],
  };
}

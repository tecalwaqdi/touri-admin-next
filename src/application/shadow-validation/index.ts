/**
 * Phase 4B — shadow validation public surface.
 */

export {
  PHASE_4B_EXPECTED_PROJECT_ID,
  PHASE_4B_SHADOW_SA,
  PHASE_4B_PAGE_LIMITS,
  emptyPhase4BShadowSummary,
  emptyCrossResourceCounters,
  type Phase4BShadowSummary,
  type ResourceShadowResult,
  type Phase4BCrossResourceCounters,
} from "@/application/shadow-validation/Phase4BShadowSummary";

export {
  collectPhase4BClosingBlockers,
  phase4BClosingGatesPass,
  isShadowValidationPassed,
  isEligibleForControlledWritesPhase,
  isControlledWritesEnabled,
  isReadyForControlledWrites,
  derivePhase4BWriteReadinessFlags,
} from "@/application/shadow-validation/Phase4BClosingGates";

export {
  validateCrossResourceReferences,
  isLegitimateGeographyAbsence,
} from "@/application/shadow-validation/Phase4BCrossResourceValidation";

export { auditCrossDomainContamination } from "@/application/shadow-validation/Phase4BCrossDomainContamination";

export {
  assertSerializedHasNoRawPii,
  assertCustomerDtoPiiSafe,
  assertDriverDtoPiiSafe,
  accumulatePiiViolations,
} from "@/application/shadow-validation/Phase4BPiiSafety";

export { validateTripFinancialSafety } from "@/application/shadow-validation/Phase4BFinancialSafety";

export {
  buildPhase4BScopeCases,
  runPhase4BScopeValidation,
} from "@/application/shadow-validation/Phase4BScopeValidation";

export {
  validatePaginationConsistency,
  PHASE_4B_SAFE_ORDER_FIELDS,
} from "@/application/shadow-validation/Phase4BPaginationValidation";

export {
  runPhase4BWriteTraps,
  assertAllWriteFlagsFalse,
} from "@/application/shadow-validation/Phase4BWriteTraps";

export {
  runPhase4BShadowValidation,
  collectBoundedShadowSnapshot,
  type Phase4BOrchestratorDeps,
  type Phase4BBoundedSnapshot,
} from "@/application/shadow-validation/Phase4BShadowOrchestrator";

export { isPhase4BLiveShadowEnabled } from "@/domain/shadow-validation/isPhase4BLiveShadowEnabled";

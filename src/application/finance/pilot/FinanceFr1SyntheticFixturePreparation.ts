/**
 * FR1 synthetic fixture preparation orchestrator — offline only.
 * No Production writes. FINANCE_WRITE_ENABLED stays false.
 * Isolated registry path APPROVED for controlled Finance pilot.
 */

import {
  assessFinanceFr1OrderCreateSideEffects,
  ORDER_TRIGGER_INSPECTION,
  type FinanceFr1OrderCreateSideEffectSummary,
} from "@/application/finance/pilot/FinanceFr1OrderTriggerInspection";
import {
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_REGISTRY_PILOT_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_DRY_RUN_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_IAM,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  assertFinanceFr1SyntheticFixtureEligibility,
  FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  type FinanceFr1SyntheticCompletedOrderDoc,
  type FinanceFr1SyntheticFixtureEligibility,
  type FinanceFr1SyntheticFixtureRegistryDoc,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import {
  evaluateFinanceFr1SyntheticFixtureCreateGate,
  FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SEMANTICS,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureCreateSemantics";
import { assertRegistryAndOrderShareCanonicalFinancePath } from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";

export type FinanceFr1SyntheticFixturePreparationResult = {
  REGISTRY_FIXTURE_DESIGN: "PASS";
  ORDER_TRIGGER_INSPECTION: typeof ORDER_TRIGGER_INSPECTION;
  sideEffects: FinanceFr1OrderCreateSideEffectSummary;
  safeFixtureStrategy: {
    name: "isolated_trigger_free_registry";
    registryCollection: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION;
    registryDocId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID;
    orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
    orderPathCreate: "FORBIDDEN";
    settlementV2: false;
    financialSoT: false;
    notes: string;
  };
  exactFixtureSchema: FinanceFr1SyntheticCompletedOrderDoc;
  registryDoc: FinanceFr1SyntheticFixtureRegistryDoc;
  eligibility: FinanceFr1SyntheticFixtureEligibility;
  canonicalPathProof: { equalMajors: true };
  exactExpectedProductionWritesThisSession: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION;
  exactExpectedProductionWritesRegistryCreate: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE;
  exactExpectedFr1PilotWrites: typeof FINANCE_FR1_EXPECTED_WRITE_COUNTS;
  requiredIamPermissions: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM;
  forbiddenIamPermissions: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_IAM;
  expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  oneShotFixtureProvisioningCommand: string;
  fr1PilotCommandUsingRegistryFixture: string;
  cleanupStrategy: {
    orderDelete: "N/A_order_not_created";
    registryDeleteIfCreated: string;
    permanentMarkedSynthetic: string;
    notes: string;
  };
  createSemantics: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SEMANTICS;
  createGateDefault: ReturnType<typeof evaluateFinanceFr1SyntheticFixtureCreateGate>;
  createGateRegistryArmedStructural: ReturnType<
    typeof evaluateFinanceFr1SyntheticFixtureCreateGate
  >;
  financeWriteEnabled: false;
  productionWritesThisSession: 0;
  goNoGoForFixtureProvisioning: "GO";
  goNoGoReasons: string[];
};

const ONE_SHOT_PROVISION_COMMAND = [
  `${FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV}=1`,
  "FINANCE_WRITE_ENABLED=false",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID}`,
  "TARGET=registry",
  `DOCUMENT_ID=${FINANCE_FR1_SYNTHETIC_ORDER_ID}`,
  `IDEMPOTENCY_KEY=${FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY}`,
  "npx vitest run src/test/live/finance-fr1-synthetic-fixture.test.ts",
].join(" \\\n  ");

const FR1_PILOT_REGISTRY_COMMAND = [
  "FINANCE_FR1_PILOT_APPLY=1",
  `${FINANCE_FR1_REGISTRY_PILOT_ENV}=1`,
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID}`,
  "SOURCE=registry",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr1-pilot-apply.test.ts",
].join(" \\\n  ");

export function prepareFinanceFr1SyntheticFixture(): FinanceFr1SyntheticFixturePreparationResult {
  const sideEffects = assessFinanceFr1OrderCreateSideEffects();
  const eligibility = assertFinanceFr1SyntheticFixtureEligibility();
  const canonicalPathProof = assertRegistryAndOrderShareCanonicalFinancePath(
    FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
    { registryPilotFlag: "1" },
  );
  const createGateDefault = evaluateFinanceFr1SyntheticFixtureCreateGate({
    FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: undefined,
    writeFlagsAllFalse: true,
    financeWriteEnabled: false,
  });
  const createGateRegistryArmedStructural =
    evaluateFinanceFr1SyntheticFixtureCreateGate({
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      target: "registry",
      writeFlagsAllFalse: true,
      financeWriteEnabled: false,
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      idempotencyKey: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    });

  return {
    REGISTRY_FIXTURE_DESIGN: "PASS",
    ORDER_TRIGGER_INSPECTION,
    sideEffects,
    safeFixtureStrategy: {
      name: "isolated_trigger_free_registry",
      registryCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
      registryDocId: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
      orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      orderPathCreate: "FORBIDDEN",
      settlementV2: false,
      financialSoT: false,
      notes:
        "Isolated pilot/test-only registry. NOT financial SoT, NOT order replacement, " +
        "NOT real-trip fallback, NOT third accounting book, NOT UI accounting source, " +
        "NOT general Production ingestion. Requires FINANCE_FR1_REGISTRY_PILOT=1 to feed " +
        "the SAME mapOrderToTripFinancialSnapshot path used after order mapping.",
    },
    exactFixtureSchema: FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
    registryDoc: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
    eligibility,
    canonicalPathProof: { equalMajors: canonicalPathProof.equalMajors },
    exactExpectedProductionWritesThisSession:
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
    exactExpectedProductionWritesRegistryCreate:
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
    exactExpectedFr1PilotWrites: FINANCE_FR1_EXPECTED_WRITE_COUNTS,
    requiredIamPermissions: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
    forbiddenIamPermissions: FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_IAM,
    expectedAdcPrincipal: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
    oneShotFixtureProvisioningCommand: ONE_SHOT_PROVISION_COMMAND,
    fr1PilotCommandUsingRegistryFixture: FR1_PILOT_REGISTRY_COMMAND,
    cleanupStrategy: {
      orderDelete: "N/A_order_not_created",
      registryDeleteIfCreated:
        `delete ${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID} ` +
        "only if no FR1 accounting snapshot was applied against orderId; else retain permanent marked synthetic",
      permanentMarkedSynthetic:
        "If FR1 snapshot already keyed by orderId, keep registry " +
        "as permanent clearly-marked synthetic (synthetic=true, financePilot=true, test_ id prefix)",
      notes:
        "Deletion safe only for unused registry docs. Never delete real/unknown orders. " +
        "No Settlement V2 cleanup required (none created).",
    },
    createSemantics: FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SEMANTICS,
    createGateDefault,
    createGateRegistryArmedStructural,
    financeWriteEnabled: false,
    productionWritesThisSession: 0,
    goNoGoForFixtureProvisioning: "GO",
    goNoGoReasons: [
      "REGISTRY_FIXTURE_DESIGN=PASS",
      "isolated_trigger_free_registry_approved",
      "order_path_create_forbidden_ORDER_TRIGGER_INSPECTION=NO-GO",
      "create_gates_structurally_open_for_registry",
      "this_session_FINANCE_WRITE_ENABLED=false",
      "this_session_production_writes=0",
      "do_not_execute_provisioning_in_prep",
      `default_arm_${FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV}_unset`,
      `dry_run_env_${FINANCE_FR1_SYNTHETIC_FIXTURE_DRY_RUN_ENV}_optional`,
      `${FINANCE_FR1_REGISTRY_PILOT_ENV}_required_to_consume_as_finance_input`,
    ],
  };
}

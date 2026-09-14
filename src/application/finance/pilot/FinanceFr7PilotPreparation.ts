/**
 * FR7 Reporting pilot preparation — offline status only.
 * Live Production verify is a separate armed read-only session.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  FINANCE_FR7_AUTHORITATIVE_SOURCE_COLLECTIONS,
  FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR7_EXPECTED_PROJECT_ID,
  FINANCE_FR7_EXPECTED_WRITE_COUNTS,
  FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
  FINANCE_FR7_PERSISTENCE_MODE,
  FINANCE_FR7_PILOT_CLEANUP_COMMAND,
  FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  FINANCE_FR7_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import {
  FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT,
  FINANCE_FR7_LOCKED_GOLDEN_EXPECTATIONS,
} from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { verifyFinanceFr7GoldenReporting } from "@/application/finance/pilot/FinanceFr7PilotCalculator";
import {
  assertFinanceFr7PrepWriteDisabled,
  evaluateFinanceFr7LiveVerifyGates,
  type FinanceFr7PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr7PilotGates";
import {
  FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
} from "@/application/finance/pilot/FinanceFr7PilotIamDerivation";

export type FinanceFr7PreparationResult = {
  fr7PrepStatus: "PASS" | "NO-GO";
  goNoGo: "GO" | "NO-GO";
  financeWriteEnabled: false;
  productionWritesThisSession: 0;
  persistenceMode: typeof FINANCE_FR7_PERSISTENCE_MODE;
  writeHarnessRequired: false;
  authoritativeSources: typeof FINANCE_FR7_AUTHORITATIVE_SOURCE_COLLECTIONS;
  expectedWriteCounts: typeof FINANCE_FR7_EXPECTED_WRITE_COUNTS;
  golden: typeof FINANCE_FR7_LOCKED_GOLDEN_EXPECTATIONS;
  fr6AdjustmentImpact: typeof FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT;
  offlineVerify: ReturnType<typeof verifyFinanceFr7GoldenReporting>;
  checklist: FinanceFr7PrepChecklistItem[];
  requiredIamPermissions: typeof FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  requiredWriteIamPermissions: typeof FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES;
  expectedAdcPrincipal: typeof FINANCE_FR7_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR7_EXPECTED_PROJECT_ID;
  oneShotLiveReadCommand: string;
  cleanupCommand: string;
};

export function prepareFinanceFr7ReportingPilot(): FinanceFr7PreparationResult {
  assertFinanceFr7PrepWriteDisabled();
  const gates = evaluateFinanceFr7LiveVerifyGates({
    env: process.env,
    mode: "preparation",
  });
  const offlineVerify = verifyFinanceFr7GoldenReporting({
    useOfflineFixture: true,
  });

  const checklist: FinanceFr7PrepChecklistItem[] = [
    {
      id: 1,
      name: "finance_write_disabled",
      pass: FINANCE_WRITE_ENABLED_DEFAULT === false,
      detail: "FINANCE_WRITE_ENABLED_DEFAULT=false",
    },
    {
      id: 2,
      name: "read_only_computed_models",
      pass: FINANCE_FR7_PERSISTENCE_MODE === "read_only_computed_models",
      detail: FINANCE_FR7_PERSISTENCE_MODE,
    },
    {
      id: 3,
      name: "production_writes_zero",
      pass: FINANCE_FR7_ZERO_WRITE_COUNTS.totalProductionWrites === 0,
      detail: "totalProductionWrites=0",
    },
    {
      id: 4,
      name: "golden_synthetic_match",
      pass: offlineVerify.reportingStatus === "PASS",
      detail: offlineVerify.blockers.join(",") || "PASS",
    },
    {
      id: 5,
      name: "fr6_neutral_memo_non_monetary",
      pass:
        FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT.monetaryEffect === false &&
        FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT.signedCompanyClaimImpactMinor ===
          "0",
      detail: "neutral_memo → monetary impact 0",
    },
    {
      id: 6,
      name: "no_write_iam_required",
      pass: FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES.length === 0,
      detail: "write IAM empty",
    },
    {
      id: 7,
      name: "prep_refuses_live",
      pass: gates.allowed === false,
      detail: gates.blockers.join(","),
    },
  ];

  const allPass = checklist.every((c) => c.pass);
  return {
    fr7PrepStatus: allPass ? "PASS" : "NO-GO",
    goNoGo: allPass ? "GO" : "NO-GO",
    financeWriteEnabled: false,
    productionWritesThisSession: 0,
    persistenceMode: FINANCE_FR7_PERSISTENCE_MODE,
    writeHarnessRequired: false,
    authoritativeSources: FINANCE_FR7_AUTHORITATIVE_SOURCE_COLLECTIONS,
    expectedWriteCounts: FINANCE_FR7_EXPECTED_WRITE_COUNTS,
    golden: FINANCE_FR7_LOCKED_GOLDEN_EXPECTATIONS,
    fr6AdjustmentImpact: FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT,
    offlineVerify,
    checklist,
    requiredIamPermissions: FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    requiredWriteIamPermissions:
      FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
    expectedAdcPrincipal: FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
    oneShotLiveReadCommand: FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
    cleanupCommand: FINANCE_FR7_PILOT_CLEANUP_COMMAND,
  };
}

export function financeFr7GoldenTotals() {
  return FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS;
}

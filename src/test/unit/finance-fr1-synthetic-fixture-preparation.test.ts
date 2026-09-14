/**
 * FR1 synthetic completed-trip Finance fixture preparation — offline unit tests.
 * Production writes = 0. FINANCE_WRITE_ENABLED stays false.
 * Isolated registry fixture design + Production rejection proofs.
 */

import { describe, expect, it } from "vitest";
import {
  assessFinanceFr1OrderCreateSideEffects,
  FINANCE_FR1_ORDER_FIXTURE_CREATE_NO_GO,
  FINANCE_FR1_ORDER_TRIGGER_ANALYSIS,
  ORDER_TRIGGER_INSPECTION,
} from "@/application/finance/pilot/FinanceFr1OrderTriggerInspection";
import {
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  assertFinanceFr1SyntheticFixtureEligibility,
  FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
  FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_FIELDS,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import {
  evaluateFinanceFr1SyntheticFixtureCreateGate,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureCreateSemantics";
import { prepareFinanceFr1SyntheticFixture } from "@/application/finance/pilot/FinanceFr1SyntheticFixturePreparation";
import {
  isFinanceFr1SyntheticFixtureCreateEnabled,
  isFinanceFr1SyntheticFixtureDryRunEnabled,
} from "@/application/finance/pilot/isFinanceFr1SyntheticFixtureCreateEnabled";
import { isFinanceFr1RegistryPilotEnabled } from "@/application/finance/pilot/isFinanceFr1RegistryPilotEnabled";
import {
  assertProductionFinanceRejectsRegistryInput,
  assertRegistryAndOrderShareCanonicalFinancePath,
  buildProductionFinanceShadowFromCanonicalInput,
  FinanceFr1RegistryPilotDeniedError,
  mapRegistryFixtureToFinanceFr1Candidate,
  mapRegistryFixtureToTripFinancialSnapshot,
} from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import { runFinanceFr1RegistryFixtureProvision } from "@/application/finance/pilot/FinanceFr1RegistryFixtureProvision";
import { mapOrderToTripFinancialSnapshot } from "@/adapters/finance/ProductionFinanceReadAdapter";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { prepareFinanceFr1Pilot } from "@/application/finance/pilot/FinanceFr1PilotPreparation";
import { evaluateFinanceFr1LiveArmGates } from "@/application/finance/pilot/FinanceFr1PilotGates";

describe("FR1 synthetic fixture — order trigger inspection", () => {
  it("marks ORDER_TRIGGER_INSPECTION=NO-GO for uncontrolled onCreate effects", () => {
    expect(ORDER_TRIGGER_INSPECTION).toBe("NO-GO");
    expect(FINANCE_FR1_ORDER_FIXTURE_CREATE_NO_GO).toBe(true);

    const summary = assessFinanceFr1OrderCreateSideEffects();
    expect(summary.ORDER_TRIGGER_INSPECTION).toBe("NO-GO");
    expect(summary.adminAgentFcmNotifications).toBe(true);
    expect(summary.agentSnapshotOrderMutation).toBe(true);
    expect(summary.externalApis).toBe(true);
    expect(summary.wallet).toBe(false);
    expect(summary.settlementV2).toBe(false);
    expect(summary.paymentRealization).toBe(false);
    expect(summary.auth).toBe(false);
    expect(summary.uncontrolledTriggers).toEqual(
      expect.arrayContaining([
        "notifyAdminsOnNewBooking",
        "syncAgentSnapshotOnOrderCreate",
      ]),
    );

    const creates = FINANCE_FR1_ORDER_TRIGGER_ANALYSIS.filter(
      (r) => r.firesOnOrderCreate,
    );
    expect(creates.every((r) => r.classification === "uncontrolled")).toBe(
      true,
    );
  });
});

describe("FR1 registry fixture — schema / gates / canonical path", () => {
  it("defaults harness SKIP and refuses order-path create", () => {
    expect(isFinanceFr1SyntheticFixtureCreateEnabled(undefined)).toBe(false);
    expect(isFinanceFr1SyntheticFixtureDryRunEnabled(undefined)).toBe(false);
    expect(isFinanceFr1SyntheticFixtureCreateEnabled("1")).toBe(true);
    expect(isFinanceFr1RegistryPilotEnabled(undefined)).toBe(false);
    expect(isFinanceFr1RegistryPilotEnabled("1")).toBe(true);

    const skip = evaluateFinanceFr1SyntheticFixtureCreateGate({
      writeFlagsAllFalse: true,
      financeWriteEnabled: false,
    });
    expect(skip.ok).toBe(false);
    if (!skip.ok) {
      expect(skip.code).toBe("FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SKIP");
      expect(skip.actualCreate).toBe(false);
    }

    const orderPath = evaluateFinanceFr1SyntheticFixtureCreateGate({
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      target: "order",
      writeFlagsAllFalse: true,
      financeWriteEnabled: false,
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      idempotencyKey: "finance_fr1_create_synthetic_completed_order_fixture_v1",
    });
    expect(orderPath.ok).toBe(false);
    if (!orderPath.ok) {
      expect(orderPath.code).toBe("ORDER_PATH_CREATE_FORBIDDEN");
    }

    const registryArmed = evaluateFinanceFr1SyntheticFixtureCreateGate({
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      target: "registry",
      writeFlagsAllFalse: true,
      financeWriteEnabled: false,
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      idempotencyKey: "finance_fr1_create_synthetic_completed_order_fixture_v1",
    });
    expect(registryArmed.ok).toBe(true);
    if (registryArmed.ok) {
      expect(registryArmed.target).toBe("registry");
      expect(registryArmed.wouldCreate).toBe(true);
      expect(registryArmed.actualCreate).toBe(false);
      expect(registryArmed.expectedWrites).toBe(2);
    }
  });

  it("locks exact majors + synthetic classification + FR1 eligibility", () => {
    const eligibility = assertFinanceFr1SyntheticFixtureEligibility();
    expect(eligibility.grossFareMinor).toBe("10000");
    expect(eligibility.commissionAmountPersistedMinor).toBe("1500");
    expect(eligibility.driverNetMinor).toBe("8500");
    expect(eligibility.eligibleRevenueMinor).toBe("10000");
    expect(eligibility.vatAmountMinor).toBe("0");
    expect(eligibility.agentAttributionStatus).toBe("unknown_historical");
    expect(eligibility.discountNotRepresented).toBe(true);

    expect(
      classifyFinanceFr1Trip({
        documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        data: FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC as unknown as Record<
          string,
          unknown
        >,
      }),
    ).toBe("synthetic_test");

    for (const field of FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_FIELDS) {
      expect(
        Object.prototype.hasOwnProperty.call(
          FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
          field,
        ),
      ).toBe(false);
    }
  });

  it("maps registry → SAME canonical Finance path as order mapping", () => {
    const proof = assertRegistryAndOrderShareCanonicalFinancePath(
      FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
      { registryPilotFlag: "1" },
    );
    expect(proof.equalMajors).toBe(true);
    expect(proof.fromRegistry.majors.grossFare.amountMinor).toBe(10000n);
    expect(proof.fromRegistry.majors.platformCommission.amountMinor).toBe(1500n);
    expect(proof.fromRegistry.majors.driverNet.amountMinor).toBe(8500n);

    const candidate = mapRegistryFixtureToFinanceFr1Candidate(
      FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
      { registryPilotFlag: "1" },
    );
    expect(candidate.documentId).toBe(FINANCE_FR1_SYNTHETIC_ORDER_ID);

    const snap = mapRegistryFixtureToTripFinancialSnapshot(
      FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
      { registryPilotFlag: "1" },
    );
    expect(snap.majors.lifecycleCompleted).toBe(true);
  });

  it("rejects registry input in normal Production Finance when flag absent", () => {
    expect(() =>
      assertProductionFinanceRejectsRegistryInput({
        sourceCollection: "admin_next_finance_fr1_order_fixtures",
        sourceKind: "registry_fixture",
        registryPilotFlag: undefined,
      }),
    ).toThrow(FinanceFr1RegistryPilotDeniedError);

    expect(() =>
      mapOrderToTripFinancialSnapshot({
        documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        data: FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC as unknown as Record<
          string,
          unknown
        >,
        sourceCollection: "admin_next_finance_fr1_order_fixtures",
        sourceKind: "registry_fixture",
        registryPilotFlag: null,
      }),
    ).toThrow(FinanceFr1RegistryPilotDeniedError);

    expect(() =>
      buildProductionFinanceShadowFromCanonicalInput(
        {
          kind: "registry_fixture",
          registryDoc: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
        },
        { registryPilotFlag: undefined },
      ),
    ).toThrow(FinanceFr1RegistryPilotDeniedError);

    // Order-sourced Production path still works without registry flag.
    const orderSnap = mapOrderToTripFinancialSnapshot({
      documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      data: FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC as unknown as Record<
        string,
        unknown
      >,
      sourceCollection: "order",
      sourceKind: "order",
    });
    expect(orderSnap.majors.grossFare.amountMinor).toBe(10000n);
  });

  it("requires FINANCE_FR1_REGISTRY_PILOT for FR1 live arm with SOURCE=registry", () => {
    const denied = evaluateFinanceFr1LiveArmGates({
      mode: "live_apply",
      env: {
        FINANCE_FR1_PILOT_APPLY: "1",
        FINANCE_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        DRIVER_WRITE_ENABLED: "false",
        AGENT_WRITE_ENABLED: "false",
        CUSTOMER_WRITE_ENABLED: "false",
        SOURCE: "registry",
      },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.blockers).toContain(
      "FINANCE_FR1_REGISTRY_PILOT!=1",
    );

    const allowed = evaluateFinanceFr1LiveArmGates({
      mode: "live_apply",
      env: {
        FINANCE_FR1_PILOT_APPLY: "1",
        FINANCE_FR1_REGISTRY_PILOT: "1",
        FINANCE_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        DRIVER_WRITE_ENABLED: "false",
        AGENT_WRITE_ENABLED: "false",
        CUSTOMER_WRITE_ENABLED: "false",
        SOURCE: "registry",
      },
    });
    expect(allowed.allowed).toBe(true);
  });

  it("feeds FR1 pilot prep from registry-mapped candidate", () => {
    const candidate = mapRegistryFixtureToFinanceFr1Candidate(
      FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
      { registryPilotFlag: "1" },
    );
    const prep = prepareFinanceFr1Pilot({
      orders: [candidate],
      actorPermissions: ["finance:read", "settlements:prepare"],
      discountFundingOwner: "company",
      priorSnapshotExists: false,
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });
    expect(prep.pilotCandidateFound).toBe(true);
    expect(prep.pilotOrderId).toBe(FINANCE_FR1_SYNTHETIC_ORDER_ID);
    expect(prep.calculatedSnapshot?.commissionRatePercent).toBe(15);
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR1_EXPECTED_WRITE_COUNTS);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.financeWriteEnabled).toBe(false);
  });

  it("preparation result is DESIGN PASS + GO for registry provisioning; writes=0", async () => {
    const result = prepareFinanceFr1SyntheticFixture();
    expect(result.REGISTRY_FIXTURE_DESIGN).toBe("PASS");
    expect(result.ORDER_TRIGGER_INSPECTION).toBe("NO-GO");
    expect(result.goNoGoForFixtureProvisioning).toBe("GO");
    expect(result.productionWritesThisSession).toBe(0);
    expect(result.financeWriteEnabled).toBe(false);
    expect(result.exactExpectedProductionWritesThisSession).toEqual(
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
    );
    expect(result.exactExpectedProductionWritesRegistryCreate).toEqual(
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
    );
    expect(
      result.exactExpectedProductionWritesRegistryCreate.totalProductionWrites,
    ).toBe(2);
    expect(result.exactExpectedFr1PilotWrites.totalProductionWrites).toBe(4);
    expect(result.expectedAdcPrincipal).toBe(
      FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
    );
    expect(result.expectedProjectId).toBe(
      FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
    );
    expect(result.requiredIamPermissions).toEqual(
      FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
    );
    expect(result.safeFixtureStrategy.name).toBe(
      "isolated_trigger_free_registry",
    );
    expect(result.safeFixtureStrategy.orderPathCreate).toBe("FORBIDDEN");
    expect(result.safeFixtureStrategy.financialSoT).toBe(false);
    expect(result.oneShotFixtureProvisioningCommand).toContain(
      "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE=1",
    );
    expect(result.oneShotFixtureProvisioningCommand).toContain(
      "FINANCE_WRITE_ENABLED=false",
    );
    expect(result.oneShotFixtureProvisioningCommand).toContain(
      "TARGET=registry",
    );
    expect(result.fr1PilotCommandUsingRegistryFixture).toContain(
      "FINANCE_FR1_REGISTRY_PILOT=1",
    );
    expect(result.fr1PilotCommandUsingRegistryFixture).toContain(
      "SOURCE=registry",
    );
    expect(result.createGateRegistryArmedStructural.ok).toBe(true);
    expect(result.canonicalPathProof.equalMajors).toBe(true);

    const provision = await runFinanceFr1RegistryFixtureProvision({
      mode: "preparation",
    });
    expect(provision.status).toBe("REFUSED_PREP");
    expect(provision.productionWrites).toBe(0);
  });

  it("rerun semantics: already exists → 0 writes; FR1 already applied → 0", async () => {
    const exists = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: {
        FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
        TARGET: "registry",
        FINANCE_WRITE_ENABLED: "false",
        EXPECTED_PROJECT_ID: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        DOCUMENT_ID: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        IDEMPOTENCY_KEY: "finance_fr1_create_synthetic_completed_order_fixture_v1",
        DRIVER_WRITE_ENABLED: "false",
        AGENT_WRITE_ENABLED: "false",
        CUSTOMER_WRITE_ENABLED: "false",
      },
      documentAlreadyExists: true,
    });
    expect(exists.status).toBe("FIXTURE_ALREADY_EXISTS");
    expect(exists.productionWrites).toBe(0);
  });
});

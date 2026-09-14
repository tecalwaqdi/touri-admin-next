/**
 * FR1 registry fixture — ADC read-only verification.
 * GET only. No writes. SKIP unless FINANCE_FR1_REGISTRY_FIXTURE_VERIFY=1.
 * SA JSON keys forbidden.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { isFinanceFr1RegistryPilotEnabled } from "@/application/finance/pilot/isFinanceFr1RegistryPilotEnabled";
import {
  assertRegistryAndOrderShareCanonicalFinancePath,
  mapRegistryFixtureToFinanceFr1Candidate,
} from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import type { FinanceFr1SyntheticFixtureRegistryDoc } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";

export type FinanceFr1RegistryFixtureVerifyResult = {
  reachable: boolean;
  projectId: string;
  productionReads: number;
  productionWrites: 0;
  registryExists: boolean;
  registryPath: string;
  orderPathExists: boolean;
  priorSnapshotExists: boolean;
  priorIdempotencyExists: boolean;
  classification: ReturnType<typeof classifyFinanceFr1Trip> | null;
  canonicalPathEqual: boolean | null;
  calculatedOk: boolean | null;
  registryPilotArmed: boolean;
  reason: string;
};

/**
 * Read-only ADC verification of the isolated registry fixture.
 * Never writes. Never materializes order/.
 */
export async function verifyFinanceFr1RegistryFixtureReadOnly(input?: {
  projectId?: string;
  registryPilotFlag?: string | null;
}): Promise<FinanceFr1RegistryFixtureVerifyResult> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? FINANCE_FR1_EXPECTED_PROJECT_ID;
  const registryPilotFlag =
    input?.registryPilotFlag ?? process.env.FINANCE_FR1_REGISTRY_PILOT;
  const registryPilotArmed = isFinanceFr1RegistryPilotEnabled(registryPilotFlag);
  let productionReads = 0;
  const registryPath = `${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID}`;

  try {
    const creds =
      await new ApplicationDefaultProductionCredentialProvider(
        projectId,
      ).getCredentials();
    if (creds.kind !== "application_default") {
      return {
        reachable: false,
        projectId,
        productionReads: 0,
        productionWrites: 0,
        registryExists: false,
        registryPath,
        orderPathExists: false,
        priorSnapshotExists: false,
        priorIdempotencyExists: false,
        classification: null,
        canonicalPathEqual: null,
        calculatedOk: null,
        registryPilotArmed,
        reason: "credentials_not_application_default",
      };
    }

    const admin = await import("firebase-admin");
    const appName = "finance-fr1-registry-fixture-ro";
    const existing = admin.apps.find((a) => a?.name === appName);
    const app =
      existing ??
      admin.initializeApp(
        {
          credential: admin.credential.applicationDefault(),
          projectId,
        },
        appName,
      );
    const db = app.firestore();

    const registrySnap = await db
      .collection(FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION)
      .doc(FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID)
      .get();
    productionReads += 1;

    const orderSnap = await db
      .collection("order")
      .doc(FINANCE_FR1_SYNTHETIC_ORDER_ID)
      .get();
    productionReads += 1;

    const snapDoc = await db
      .collection(FINANCE_FR1_SNAPSHOT_COLLECTION)
      .doc(FINANCE_FR1_SYNTHETIC_ORDER_ID)
      .get();
    productionReads += 1;

    const idemDoc = await db
      .collection(FINANCE_FR1_IDEMPOTENCY_COLLECTION)
      .doc(FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY)
      .get();
    productionReads += 1;

    if (!registrySnap.exists) {
      return {
        reachable: true,
        projectId,
        productionReads,
        productionWrites: 0,
        registryExists: false,
        registryPath,
        orderPathExists: orderSnap.exists,
        priorSnapshotExists: snapDoc.exists,
        priorIdempotencyExists: idemDoc.exists,
        classification: null,
        canonicalPathEqual: null,
        calculatedOk: null,
        registryPilotArmed,
        reason: "registry_fixture_missing",
      };
    }

    const registryDoc =
      registrySnap.data() as FinanceFr1SyntheticFixtureRegistryDoc;

    let canonicalPathEqual: boolean | null = null;
    let calculatedOk: boolean | null = null;
    let classification: ReturnType<typeof classifyFinanceFr1Trip> | null = null;

    if (registryPilotArmed) {
      const eq = assertRegistryAndOrderShareCanonicalFinancePath(registryDoc, {
        registryPilotFlag,
      });
      canonicalPathEqual = eq.equalMajors;
      const candidate = mapRegistryFixtureToFinanceFr1Candidate(registryDoc, {
        registryPilotFlag,
      });
      classification = classifyFinanceFr1Trip(candidate);
      const calc = calculateFinanceFr1PilotSnapshot({
        order: candidate,
        actorUserId: "finance_fr1_registry_verify_actor",
        discountFundingOwner: "company",
        asOfUtc: "2026-09-13T21:00:00.000Z",
      });
      calculatedOk = calc.reconciliationStatus === "preconditions_ok";
    }

    return {
      reachable: true,
      projectId,
      productionReads,
      productionWrites: 0,
      registryExists: true,
      registryPath,
      orderPathExists: orderSnap.exists,
      priorSnapshotExists: snapDoc.exists,
      priorIdempotencyExists: idemDoc.exists,
      classification,
      canonicalPathEqual,
      calculatedOk,
      registryPilotArmed,
      reason: registryPilotArmed
        ? "registry_fixture_verified_readonly"
        : "registry_exists_but_FINANCE_FR1_REGISTRY_PILOT_unset",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      projectId,
      productionReads,
      productionWrites: 0,
      registryExists: false,
      registryPath,
      orderPathExists: false,
      priorSnapshotExists: false,
      priorIdempotencyExists: false,
      classification: null,
      canonicalPathEqual: null,
      calculatedOk: null,
      registryPilotArmed,
      reason: `adc_unreachable:${message}`,
    };
  }
}

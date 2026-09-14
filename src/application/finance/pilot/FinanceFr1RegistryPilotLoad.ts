/**
 * FR1 pilot — ADC read-only load of the isolated registry fixture as candidate.
 * Requires FINANCE_FR1_REGISTRY_PILOT=1. GET only. No writes.
 * Maps to SAME canonical Finance path used after order mapping.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { isFinanceFr1RegistryPilotEnabled } from "@/application/finance/pilot/isFinanceFr1RegistryPilotEnabled";
import {
  FinanceFr1RegistryPilotDeniedError,
  mapRegistryFixtureToFinanceFr1Candidate,
} from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import type { FinanceFr1SyntheticFixtureRegistryDoc } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import {
  classifyFinanceFr1Trip,
  type FinanceFr1CandidateOrder,
} from "@/application/finance/pilot/FinanceFr1PilotCandidate";

export type FinanceFr1RegistryPilotLoadResult = {
  reachable: boolean;
  projectId: string;
  productionReads: number;
  productionWrites: 0;
  registryExists: boolean;
  selected: FinanceFr1CandidateOrder | null;
  selectedClassification: ReturnType<typeof classifyFinanceFr1Trip> | null;
  priorSnapshotExists: boolean;
  priorIdempotencyExists: boolean;
  reason: string;
};

/**
 * Load ONE registry fixture as FR1 candidate. Rejected without pilot flag.
 */
export async function loadFinanceFr1PilotCandidateFromRegistry(input?: {
  projectId?: string;
  registryPilotFlag?: string | null;
}): Promise<FinanceFr1RegistryPilotLoadResult> {
  const registryPilotFlag =
    input?.registryPilotFlag ?? process.env.FINANCE_FR1_REGISTRY_PILOT;

  if (!isFinanceFr1RegistryPilotEnabled(registryPilotFlag)) {
    throw new FinanceFr1RegistryPilotDeniedError(
      "FINANCE_FR1_REGISTRY_PILOT=1 required to load registry Finance input",
    );
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? FINANCE_FR1_EXPECTED_PROJECT_ID;
  let productionReads = 0;

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
        selected: null,
        selectedClassification: null,
        priorSnapshotExists: false,
        priorIdempotencyExists: false,
        reason: "credentials_not_application_default",
      };
    }

    const admin = await import("firebase-admin");
    const appName = "finance-fr1-registry-pilot-load";
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

    if (!registrySnap.exists) {
      return {
        reachable: true,
        projectId,
        productionReads,
        productionWrites: 0,
        registryExists: false,
        selected: null,
        selectedClassification: null,
        priorSnapshotExists: false,
        priorIdempotencyExists: false,
        reason: "registry_fixture_missing",
      };
    }

    const registryDoc =
      registrySnap.data() as FinanceFr1SyntheticFixtureRegistryDoc;
    const selected = mapRegistryFixtureToFinanceFr1Candidate(registryDoc, {
      registryPilotFlag,
    });

    const snapDoc = await db
      .collection(FINANCE_FR1_SNAPSHOT_COLLECTION)
      .doc(FINANCE_FR1_SYNTHETIC_ORDER_ID)
      .get();
    productionReads += 1;

    const idemDoc = await db
      .collection(FINANCE_FR1_IDEMPOTENCY_COLLECTION)
      .doc(FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID)
      .get();
    productionReads += 1;

    return {
      reachable: true,
      projectId,
      productionReads,
      productionWrites: 0,
      registryExists: true,
      selected,
      selectedClassification: classifyFinanceFr1Trip(selected),
      priorSnapshotExists: snapDoc.exists,
      priorIdempotencyExists: idemDoc.exists,
      reason: "registry_fixture_loaded_as_fr1_candidate",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      projectId,
      productionReads,
      productionWrites: 0,
      registryExists: false,
      selected: null,
      selectedClassification: null,
      priorSnapshotExists: false,
      priorIdempotencyExists: false,
      reason: `adc_unreachable:${message}`,
    };
  }
}

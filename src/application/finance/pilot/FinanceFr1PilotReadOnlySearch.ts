/**
 * FR1 pilot — ADC read-only search for ONE safe synthetic/test completed trip.
 * GET/query only. No writes. SA JSON keys forbidden.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import type { FinanceFr1CandidateOrder } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import {
  classifyFinanceFr1Trip,
  selectOneSafeSyntheticFinanceFr1Candidate,
} from "@/application/finance/pilot/FinanceFr1PilotCandidate";

export class FinanceFr1PilotSearchUnreachableError extends Error {
  readonly code = "FINANCE_FR1_PILOT_SEARCH_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr1PilotSearchUnreachableError";
  }
}

export type FinanceFr1ReadOnlySearchResult = {
  reachable: boolean;
  projectId: string;
  productionReads: number;
  productionWrites: 0;
  completedOrdersScanned: number;
  syntheticCandidates: number;
  realOrUnknownSkipped: number;
  selected: FinanceFr1CandidateOrder | null;
  selectedClassification: ReturnType<typeof classifyFinanceFr1Trip> | null;
  priorSnapshotExists: boolean;
  priorIdempotencyExists: boolean;
  reason: string;
};

/**
 * Read-only ADC search. Prefer synthetic/test completed orders.
 * Never selects real financial records.
 */
export async function searchFinanceFr1PilotCandidateReadOnly(input?: {
  projectId?: string;
  orderLimit?: number;
}): Promise<FinanceFr1ReadOnlySearchResult> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new FinanceFr1PilotSearchUnreachableError(
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
        completedOrdersScanned: 0,
        syntheticCandidates: 0,
        realOrUnknownSkipped: 0,
        selected: null,
        selectedClassification: null,
        priorSnapshotExists: false,
        priorIdempotencyExists: false,
        reason: "credentials_not_application_default",
      };
    }

    const admin = await import("firebase-admin");
    const appName = "finance-fr1-pilot-readonly";
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
    const orderLimit = Math.min(input?.orderLimit ?? 50, 50);

    const orderSnap = await db
      .collection("order")
      .where("status_code", "==", "completed")
      .limit(orderLimit)
      .get();
    productionReads += 1;

    // Also probe synthetic flags if first page has none synthetic.
    const orders: FinanceFr1CandidateOrder[] = orderSnap.docs.map((d) => ({
      documentId: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    // Secondary probe: explicit synthetic completed trips.
    try {
      const synthSnap = await db
        .collection("order")
        .where("synthetic", "==", true)
        .where("status_code", "==", "completed")
        .limit(20)
        .get();
      productionReads += 1;
      for (const d of synthSnap.docs) {
        if (!orders.some((o) => o.documentId === d.id)) {
          orders.push({
            documentId: d.id,
            data: d.data() as Record<string, unknown>,
          });
        }
      }
    } catch {
      // Composite index may be missing — ignore; primary page still scanned.
    }

    let syntheticCandidates = 0;
    let realOrUnknownSkipped = 0;
    for (const o of orders) {
      const c = classifyFinanceFr1Trip(o);
      if (c === "synthetic_test") syntheticCandidates += 1;
      else realOrUnknownSkipped += 1;
    }

    const selected = selectOneSafeSyntheticFinanceFr1Candidate(orders);

    let priorSnapshotExists = false;
    let priorIdempotencyExists = false;
    if (selected) {
      const snapDoc = await db
        .collection(FINANCE_FR1_SNAPSHOT_COLLECTION)
        .doc(selected.documentId)
        .get();
      productionReads += 1;
      priorSnapshotExists = snapDoc.exists;

      const idemDoc = await db
        .collection(FINANCE_FR1_IDEMPOTENCY_COLLECTION)
        .doc(FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID)
        .get();
      productionReads += 1;
      priorIdempotencyExists = idemDoc.exists;
    }

    return {
      reachable: true,
      projectId,
      productionReads,
      productionWrites: 0,
      completedOrdersScanned: orders.length,
      syntheticCandidates,
      realOrUnknownSkipped,
      selected,
      selectedClassification: selected
        ? classifyFinanceFr1Trip(selected)
        : null,
      priorSnapshotExists,
      priorIdempotencyExists,
      reason: selected
        ? "synthetic_test_candidate_selected"
        : "no_safe_synthetic_test_completed_trip",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      projectId,
      productionReads,
      productionWrites: 0,
      completedOrdersScanned: 0,
      syntheticCandidates: 0,
      realOrUnknownSkipped: 0,
      selected: null,
      selectedClassification: null,
      priorSnapshotExists: false,
      priorIdempotencyExists: false,
      reason: `adc_unreachable:${message}`,
    };
  }
}

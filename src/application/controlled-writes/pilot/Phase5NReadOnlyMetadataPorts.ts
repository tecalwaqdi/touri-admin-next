/**
 * Phase 5N — read-only ports for audit / idempotency / driver / auth metadata.
 * GET only. No create / set / update / delete.
 */

import type {
  Phase5NObservedAuditIntent,
  Phase5NObservedAuditResult,
  Phase5NObservedMetadata,
} from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";
import {
  PHASE_5N_AUDIT_COLLECTION,
  PHASE_5N_IDEMPOTENCY_COLLECTION,
  PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";
import { PHASE_5N_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

export type Phase5NMetadataReadPort = {
  loadObservedMetadata(input: {
    driverId: string;
  }): Promise<Phase5NObservedMetadata>;
};

export type Phase5NReadCounter = { productionReads: number };

export class Phase5NReadOnlyAdaptersUnreachableError extends Error {
  readonly code = "PHASE5N_READONLY_ADAPTERS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "Phase5NReadOnlyAdaptersUnreachableError";
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function mapFirestoreAuditDoc(
  id: string,
  data: Record<string, unknown>,
): Phase5NObservedAuditIntent | Phase5NObservedAuditResult | null {
  const kind = asString(data.kind);
  if (kind === "AUDIT_INTENT") {
    const intent: Phase5NObservedAuditIntent = {
      auditId: asString(data.auditId) ?? id,
      kind: "AUDIT_INTENT",
      action: asString(data.action) ?? "",
      driverId: asString(data.driverId) ?? "",
      countryId:
        data.countryId === null ? null : (asString(data.countryId) ?? null),
      fromState: asString(data.fromState) ?? "",
      toState: asString(data.toState) ?? "",
      reasonCode: asString(data.reasonCode),
      idempotencyKey: asString(data.idempotencyKey) ?? "",
      correlationId: asString(data.correlationId) ?? "",
      phase: asString(data.phase),
      createdAtUtc: asString(data.createdAtUtc),
    };
    return intent;
  }
  if (kind !== "AUDIT_RESULT") return null;
  const hasCode = Object.prototype.hasOwnProperty.call(data, "code");
  const result: Phase5NObservedAuditResult = {
    auditId: asString(data.auditId) ?? id,
    kind: "AUDIT_RESULT",
    intentAuditId: asString(data.intentAuditId) ?? "",
    outcome: asString(data.outcome) ?? "",
    code: asString(data.code),
    action: asString(data.action) ?? "",
    driverId: asString(data.driverId) ?? "",
    countryId:
      data.countryId === null ? null : (asString(data.countryId) ?? null),
    fromState: asString(data.fromState),
    toState: asString(data.toState),
    idempotencyKey: asString(data.idempotencyKey) ?? "",
    correlationId: asString(data.correlationId) ?? "",
    phase: asString(data.phase),
    createdAtUtc: asString(data.createdAtUtc),
    hasUndefinedCodeField: hasCode && data.code === undefined,
  };
  return result;
}

/**
 * ADC read-only Firebase ports for Phase 5N dry-run inspection.
 */
export async function createPhase5NReadOnlyMetadataPorts(input?: {
  projectId?: string;
  counter?: Phase5NReadCounter;
}): Promise<{
  port: Phase5NMetadataReadPort;
  counter: Phase5NReadCounter;
}> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Phase5NReadOnlyAdaptersUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_5N_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new Phase5NReadOnlyAdaptersUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = "phase5n-metadata-reconcile-ro";
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

  const auth = admin.auth(app);
  const db = admin.firestore(app);
  const counter = input?.counter ?? { productionReads: 0 };

  const port: Phase5NMetadataReadPort = {
    async loadObservedMetadata({ driverId }) {
      counter.productionReads += 1;
      const userSnap = await db.doc(`user/${driverId}`).get();
      const driverExists = userSnap.exists;
      const driverState = driverExists
        ? asString(userSnap.data()?.registration_status) ?? null
        : null;

      counter.productionReads += 1;
      const intentSnap = await db
        .doc(`${PHASE_5N_AUDIT_COLLECTION}/${PHASE_5N_ORIGINAL_INTENT_AUDIT_ID}`)
        .get();
      let auditIntent: Phase5NObservedMetadata["auditIntent"] = null;
      if (intentSnap.exists) {
        const mapped = mapFirestoreAuditDoc(
          intentSnap.id,
          (intentSnap.data() ?? {}) as Record<string, unknown>,
        );
        if (mapped?.kind === "AUDIT_INTENT") auditIntent = mapped;
      }

      // Targeted gets only — avoid composite-index collection queries.
      const resultDocs: Phase5NObservedMetadata["auditResults"][number][] = [];
      const candidateIds = new Set<string>([
        PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
      ]);

      counter.productionReads += 1;
      const idemSnap = await db
        .doc(
          `${PHASE_5N_IDEMPOTENCY_COLLECTION}/${PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY}`,
        )
        .get();
      let idempotency: Phase5NObservedMetadata["idempotency"] = null;
      if (idemSnap.exists) {
        const data = (idemSnap.data() ?? {}) as Record<string, unknown>;
        const result = (data.result ?? {}) as Record<string, unknown>;
        const auditResultId = asString(result.auditResultId) ?? "";
        idempotency = {
          key: asString(data.key) ?? PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
          fingerprint: asString(data.fingerprint) ?? "",
          result: {
            ok: result.ok === true,
            status: asString(result.status) ?? "",
            action: asString(result.action),
            driverId: asString(result.driverId),
            fromState: asString(result.fromState),
            toState: asString(result.toState),
            auditIntentId: asString(result.auditIntentId) ?? "",
            auditResultId,
            productionWriteExecuted: result.productionWriteExecuted === true,
          },
          phase: asString(data.phase),
          createdAtUtc: asString(data.createdAtUtc),
        };
        if (auditResultId.trim()) candidateIds.add(auditResultId);
      }

      for (const id of candidateIds) {
        counter.productionReads += 1;
        const snap = await db.doc(`${PHASE_5N_AUDIT_COLLECTION}/${id}`).get();
        if (!snap.exists) continue;
        const mapped = mapFirestoreAuditDoc(
          snap.id,
          (snap.data() ?? {}) as Record<string, unknown>,
        );
        if (mapped?.kind === "AUDIT_RESULT") resultDocs.push(mapped);
      }

      counter.productionReads += 1;
      let authMeta: Phase5NObservedMetadata["auth"] = null;
      try {
        const user = await auth.getUser(driverId);
        const claims = (user.customClaims ?? {}) as Record<string, unknown>;
        authMeta = {
          exists: true,
          disabled: user.disabled === true,
          claimsKeys: Object.keys(claims),
          countryIdClaimPresent: typeof claims.country_id === "string",
        };
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "auth/user-not-found") {
          authMeta = {
            exists: false,
            disabled: null,
            claimsKeys: [],
            countryIdClaimPresent: false,
          };
        } else {
          throw err;
        }
      }

      return {
        driverState,
        driverExists,
        auditIntent,
        auditResults: resultDocs,
        idempotency,
        auth: authMeta,
      };
    },
  };

  return { port, counter };
}

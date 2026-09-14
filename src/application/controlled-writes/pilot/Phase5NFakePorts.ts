/**
 * Phase 5N — Fake/offline ports for metadata reconcile unit tests.
 * Never touches Firebase. Proves domain / Auth / Finance never written.
 */

import type { Phase5NObservedMetadata } from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";
import type { Phase5NMetadataReadPort } from "@/application/controlled-writes/pilot/Phase5NReadOnlyMetadataPorts";
import {
  assertFirestoreDocumentHasNoUndefined,
  omitUndefinedDeep,
} from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  createPhase5NWriteCounter,
  type Phase5NApplyPorts,
  type Phase5NMetadataWritePort,
  type Phase5NWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5NApplyPorts";
import {
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

export type Phase5NFakePortsOptions = {
  /** Mutable observed snapshot (updated after fake writes for post-verify). */
  observed: Phase5NObservedMetadata;
  counter?: Phase5NWriteCounter;
  /** Force create to throw. */
  failCreate?: boolean;
  /** Force patch to throw. */
  failPatch?: boolean;
  /**
   * If true, any accidental domain write attempt increments counter and throws.
   * Fake has no domain write method — this documents the invariant.
   */
  domainWriteAttempted?: boolean;
};

export function createPhase5NFakeApplyPorts(
  opts: Phase5NFakePortsOptions,
): Phase5NApplyPorts & {
  /** Test probe: created success RESULT payloads. */
  createdResults: Array<{ documentId: string; payload: Record<string, unknown> }>;
  /** Test probe: idempotency patches (must be auditResultId-only). */
  idempotencyPatches: Array<{ key: string; auditResultId: string; patch: Record<string, unknown> }>;
  /** Mutable observed store. */
  store: { observed: Phase5NObservedMetadata };
} {
  const counter = opts.counter ?? createPhase5NWriteCounter();
  const store = { observed: opts.observed };
  const createdResults: Array<{
    documentId: string;
    payload: Record<string, unknown>;
  }> = [];
  const idempotencyPatches: Array<{
    key: string;
    auditResultId: string;
    patch: Record<string, unknown>;
  }> = [];

  if (opts.domainWriteAttempted) {
    counter.driverDomainWrites += 1;
  }

  const read: Phase5NMetadataReadPort = {
    async loadObservedMetadata() {
      counter.productionReads += 1;
      return store.observed;
    },
  };

  const write: Phase5NMetadataWritePort = {
    async createSuccessAuditResult({ documentId, payload }) {
      if (opts.failCreate) {
        throw new Error("PHASE5N_FAKE_CREATE_FAILED");
      }
      const clean = omitUndefinedDeep(payload) as Record<string, unknown>;
      assertFirestoreDocumentHasNoUndefined(clean);
      if (Object.prototype.hasOwnProperty.call(clean, "code")) {
        throw new Error("PHASE5N_FAKE_CREATE_REJECTED_CODE_FIELD");
      }
      createdResults.push({ documentId, payload: clean });
      counter.successAuditResultCreates += 1;

      const intent = store.observed.auditIntent;
      store.observed = {
        ...store.observed,
        auditResults: [
          ...store.observed.auditResults,
          {
            auditId: documentId,
            kind: "AUDIT_RESULT",
            intentAuditId: String(clean.intentAuditId ?? ""),
            outcome: String(clean.outcome ?? ""),
            action: String(clean.action ?? ""),
            driverId: intent?.driverId ?? String(clean.driverId ?? ""),
            countryId:
              intent?.countryId ??
              (clean.countryId === null
                ? null
                : String(clean.countryId ?? "")),
            fromState: String(clean.fromState ?? ""),
            toState: String(clean.toState ?? ""),
            idempotencyKey: String(clean.idempotencyKey ?? ""),
            correlationId: String(clean.correlationId ?? ""),
            phase: String(clean.phase ?? ""),
            createdAtUtc: String(clean.createdAtUtc ?? ""),
          },
        ],
      };
    },

    async patchIdempotencyAuditResultId({ key, auditResultId }) {
      if (opts.failPatch) {
        throw new Error("PHASE5N_FAKE_PATCH_FAILED");
      }
      if (!store.observed.idempotency) {
        throw new Error("PHASE5N_FAKE_IDEMPOTENCY_MISSING");
      }
      if (key !== PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY) {
        throw new Error("PHASE5N_FAKE_WRONG_IDEMPOTENCY_KEY");
      }
      // Minimum patch only — never rewrite other fields.
      const patch = {
        result: {
          auditResultId,
        },
      };
      assertFirestoreDocumentHasNoUndefined(patch);
      idempotencyPatches.push({ key, auditResultId, patch });
      counter.idempotencyPatches += 1;

      store.observed = {
        ...store.observed,
        idempotency: {
          ...store.observed.idempotency,
          result: {
            ...store.observed.idempotency.result,
            auditResultId,
          },
        },
      };
    },
  };

  return {
    read,
    write,
    counter,
    createdResults,
    idempotencyPatches,
    store,
  };
}

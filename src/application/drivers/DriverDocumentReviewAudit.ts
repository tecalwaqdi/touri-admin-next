/**
 * Admin Next audit payloads for per-document driver review (CF + allowlisted patch).
 * Safe fields only — no PII / storage URLs.
 */

import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import type {
  DriverDocumentReviewAction,
  DriverDocumentReviewSlot,
} from "@/domain/driver/DriverDocumentReview";

export type DriverDocumentReviewAuditDoc = {
  kind: "AUDIT_RESULT";
  auditId: string;
  actorUid: string;
  actorRole: string;
  resource: "driver";
  resourceType: "driver";
  resourceId: string;
  driverId: string;
  action: DriverDocumentReviewAction;
  slot: DriverDocumentReviewSlot;
  outcome: "applied" | "idempotent_replay";
  fromState: string | null;
  toState: "approved" | "rejected" | "needs_changes";
  beforeSafe: {
    slot: DriverDocumentReviewSlot;
    documentVersion: number;
  };
  afterSafe: {
    slot: DriverDocumentReviewSlot;
    reviewStatus: "approved" | "rejected" | "needs_changes";
    documentVersion: number;
    path: "cloud_function" | "allowlisted_patch";
  };
  reason: string;
  idempotencyKey: string;
  correlationId: string;
  environment: "production";
  createdAtUtc: string;
};

export function buildDriverDocumentReviewAuditDoc(input: {
  auditId: string;
  actorUid: string;
  actorRole?: string;
  driverId: string;
  action: DriverDocumentReviewAction;
  slot: DriverDocumentReviewSlot;
  reviewStatus: "approved" | "rejected" | "needs_changes";
  expectedDocumentVersion: number;
  resultingDocumentVersion: number;
  reason: string;
  idempotencyKey: string;
  replay: boolean;
  path: "cloud_function" | "allowlisted_patch";
}): DriverDocumentReviewAuditDoc {
  const doc: DriverDocumentReviewAuditDoc = {
    kind: "AUDIT_RESULT",
    auditId: input.auditId,
    actorUid: input.actorUid,
    actorRole: input.actorRole ?? "unknown",
    resource: "driver",
    resourceType: "driver",
    resourceId: input.driverId,
    driverId: input.driverId,
    action: input.action,
    slot: input.slot,
    outcome: input.replay ? "idempotent_replay" : "applied",
    fromState: null,
    toState: input.reviewStatus,
    beforeSafe: {
      slot: input.slot,
      documentVersion: input.expectedDocumentVersion,
    },
    afterSafe: {
      slot: input.slot,
      reviewStatus: input.reviewStatus,
      documentVersion: input.resultingDocumentVersion,
      path: input.path,
    },
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.idempotencyKey,
    environment: "production",
    createdAtUtc: new Date().toISOString(),
  };
  const pii = assertAuditPayloadHasNoRawPii(doc);
  if (!pii.ok) {
    throw new Error(`Document review audit PII violation: ${pii.violations.join(",")}`);
  }
  return doc;
}

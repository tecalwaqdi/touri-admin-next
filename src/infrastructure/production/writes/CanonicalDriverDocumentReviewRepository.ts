import { createHash } from "node:crypto";
import {
  CanonicalDriverDocumentReviewError,
  type CanonicalDriverDocumentReviewCommand,
  type CanonicalDriverDocumentReviewReceipt,
  type CanonicalDriverDocumentReviewRepository,
  type DriverDocumentReviewTarget,
} from "@/application/drivers/CanonicalDriverDocumentReview";
import {
  toCfDocumentReviewAction,
  toCfDocumentType,
  type DriverDocumentReviewAction,
} from "@/domain/driver/DriverDocumentReview";
import type { DriverReviewRequestBindingPort } from "./CanonicalDriverReviewRepository";
import type { ProductionFirestoreWritePort } from "./ProductionFirestoreWritePort";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const statusForAction: Record<
  DriverDocumentReviewAction,
  "approved" | "rejected" | "needs_changes"
> = {
  approve: "approved",
  reject: "rejected",
  needs_changes: "needs_changes",
};

const cfStatusForAction: Record<
  DriverDocumentReviewAction,
  "approved" | "rejected" | "needs_replacement"
> = {
  approve: "approved",
  reject: "rejected",
  needs_changes: "needs_replacement",
};

const errorCodes: Record<string, [string, number]> = {
  INVALID_ARGUMENT: ["VALIDATION_FAILED", 400],
  UNAUTHENTICATED: ["UNAUTHORIZED", 401],
  PERMISSION_DENIED: ["PERMISSION_DENIED", 403],
  NOT_FOUND: ["DRIVER_NOT_FOUND", 404],
  ABORTED: ["PRECONDITION_FAILED", 409],
  FAILED_PRECONDITION: ["DRIVER_NOT_READY", 409],
  RESOURCE_EXHAUSTED: ["RATE_LIMITED", 429],
};

/**
 * Production per-document review.
 * CF-backed slots → reviewDriverDocument callable.
 * Photo slots (not in CF DOC_FIELD) → allowlisted WIF user map patch + audit.
 */
export class ProductionCanonicalDriverDocumentReviewRepository
  implements CanonicalDriverDocumentReviewRepository
{
  constructor(
    private readonly deps: {
      projectId: string;
      firebaseIdToken: string;
      bindings: DriverReviewRequestBindingPort;
      writePort?: ProductionFirestoreWritePort;
      actorUid: string;
      fetcher?: typeof fetch;
    },
  ) {
    if (
      deps.projectId !== "tutorial-multi-language-70gx4j" ||
      !deps.firebaseIdToken
    ) {
      throw new CanonicalDriverDocumentReviewError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
      );
    }
  }

  async reserve(
    actorId: string,
    command: CanonicalDriverDocumentReviewCommand,
  ): Promise<string> {
    const key = digest(["driver-doc-review-v1", actorId, command.idempotencyKey]);
    const fingerprint = digest([
      command.action,
      command.driverId,
      command.slot,
      command.expectedDocumentVersion,
      command.reason,
    ]);
    await this.deps.bindings.bind(key, fingerprint);
    return `adminnext_doc_${key}`;
  }

  async review(
    command: CanonicalDriverDocumentReviewCommand,
    workflowKey: string,
    target: DriverDocumentReviewTarget,
  ): Promise<CanonicalDriverDocumentReviewReceipt> {
    const cfType = toCfDocumentType(command.slot);
    if (cfType) {
      return this.reviewViaCloudFunction(command, workflowKey, cfType);
    }
    return this.reviewViaAllowlistedPatch(command, workflowKey, target);
  }

  private async reviewViaCloudFunction(
    command: CanonicalDriverDocumentReviewCommand,
    workflowKey: string,
    documentType: string,
  ): Promise<CanonicalDriverDocumentReviewReceipt> {
    const action = toCfDocumentReviewAction(command.action);
    let response: Response;
    try {
      response = await (this.deps.fetcher ?? fetch)(
        `https://us-central1-${this.deps.projectId}.cloudfunctions.net/reviewDriverDocument`,
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${this.deps.firebaseIdToken}`,
          },
          body: JSON.stringify({
            data: {
              action,
              driverId: command.driverId,
              documentType,
              reason: command.reason,
              idempotencyKey: workflowKey,
            },
          }),
        },
      );
    } catch {
      throw new CanonicalDriverDocumentReviewError("WRITE_OUTCOME_UNKNOWN", 503);
    }
    let payload: {
      result?: Record<string, unknown>;
      error?: { status?: string; message?: string };
    };
    try {
      payload = await response.json();
    } catch {
      throw new CanonicalDriverDocumentReviewError("WRITE_OUTCOME_UNKNOWN", 503);
    }
    if (!response.ok || payload.error) {
      const [code, status] =
        errorCodes[payload.error?.status ?? ""] ?? ["WRITE_OUTCOME_UNKNOWN", 503];
      throw new CanonicalDriverDocumentReviewError(code, status);
    }
    const result = payload.result;
    const expectedCfStatus = cfStatusForAction[command.action];
    if (
      !result ||
      result.ok !== true ||
      result.driverId !== command.driverId ||
      result.reviewStatus !== expectedCfStatus
    ) {
      throw new CanonicalDriverDocumentReviewError("WRITE_RECEIPT_MISMATCH", 503);
    }
    return {
      driverId: command.driverId,
      slot: command.slot,
      action: command.action,
      reviewStatus: statusForAction[command.action],
      documentVersion: command.expectedDocumentVersion,
      replay: result.idempotent === true,
    };
  }

  private async reviewViaAllowlistedPatch(
    command: CanonicalDriverDocumentReviewCommand,
    workflowKey: string,
    target: DriverDocumentReviewTarget,
  ): Promise<CanonicalDriverDocumentReviewReceipt> {
    const port = this.deps.writePort;
    if (!port) {
      throw new CanonicalDriverDocumentReviewError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
      );
    }
    const snap = await port.getDocument("user", command.driverId);
    if (!snap.exists || !snap.data) {
      throw new CanonicalDriverDocumentReviewError("DRIVER_NOT_FOUND", 404);
    }
    const rawSlot = snap.data[target.slotField];
    const slot =
      rawSlot && typeof rawSlot === "object"
        ? { ...(rawSlot as Record<string, unknown>) }
        : {};
    const version = Number(slot.documentVersion ?? slot.version ?? 1);
    if (version !== command.expectedDocumentVersion) {
      throw new CanonicalDriverDocumentReviewError("PRECONDITION_FAILED", 409);
    }
    const nextStatus = statusForAction[command.action];
    const storageStatus =
      nextStatus === "needs_changes" ? "needs_reupload" : nextStatus;
    const nextSlot = {
      ...slot,
      reviewStatus:
        nextStatus === "needs_changes" ? "needs_replacement" : nextStatus,
      status: storageStatus,
      reviewReason: command.reason || "",
      reviewedAt: new Date().toISOString(),
      reviewedBy: this.deps.actorUid,
      documentVersion: version + 1,
    };
    const patch: Record<string, unknown> = {
      [target.slotField]: nextSlot,
      last_document_review_at: new Date().toISOString(),
    };
    if (command.action === "reject" || command.action === "needs_changes") {
      patch.actev_mndob = false;
      patch.ngl = false;
      patch.registration_status = "needs_changes";
      patch.submission_status = "changesRequested";
      patch.rejection_reason = command.reason;
    }
    try {
      await port.updateDocument("user", command.driverId, patch, {
        expectedUpdateTime: snap.updateTime,
      });
      await port.createDocument(
        "admin_next_cw_audit",
        workflowKey.slice(0, 64),
        {
          kind: "driver_document_review",
          driverId: command.driverId,
          slot: command.slot,
          action: command.action,
          reviewStatus: nextStatus,
          reason: command.reason,
          actorUid: this.deps.actorUid,
          documentVersion: version + 1,
          createdAtUtc: new Date().toISOString(),
        },
      );
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "";
      if (code === "PRECONDITION_FAILED" || code === "ABORTED") {
        throw new CanonicalDriverDocumentReviewError("PRECONDITION_FAILED", 409);
      }
      if (code === "ALREADY_EXISTS") {
        return {
          driverId: command.driverId,
          slot: command.slot,
          action: command.action,
          reviewStatus: nextStatus,
          documentVersion: version + 1,
          replay: true,
        };
      }
      throw new CanonicalDriverDocumentReviewError("WRITE_OUTCOME_UNKNOWN", 503);
    }
    return {
      driverId: command.driverId,
      slot: command.slot,
      action: command.action,
      reviewStatus: nextStatus,
      documentVersion: version + 1,
      replay: false,
    };
  }
}

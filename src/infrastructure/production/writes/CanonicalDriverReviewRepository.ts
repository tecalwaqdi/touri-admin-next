import { createHash } from "node:crypto";
import {
  CanonicalDriverReviewError,
  type CanonicalDriverReviewCommand,
  type CanonicalDriverReviewReceipt,
  type CanonicalDriverReviewRepository,
} from "@/application/drivers/CanonicalDriverReview";

export interface DriverReviewRequestBindingPort {
  /** Create-if-absent; never overwrite a different fingerprint. */
  bind(key: string, fingerprint: string): Promise<void>;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const statusForAction = { approve: "approved", reject: "rejected", needs_changes: "needs_changes" } as const;
const errorCodes: Record<string, [string, number]> = {
  "INVALID_ARGUMENT": ["VALIDATION_FAILED", 400],
  "UNAUTHENTICATED": ["UNAUTHORIZED", 401],
  "PERMISSION_DENIED": ["PERMISSION_DENIED", 403],
  "NOT_FOUND": ["DRIVER_NOT_FOUND", 404],
  "ABORTED": ["PRECONDITION_FAILED", 409],
  "FAILED_PRECONDITION": ["DRIVER_NOT_READY", 409],
  "RESOURCE_EXHAUSTED": ["RATE_LIMITED", 429],
};

/** Delegates only reviewDriverApplicationV2. No override/adminProfile/raw-patch input. */
export class ProductionCanonicalDriverReviewRepository implements CanonicalDriverReviewRepository {
  constructor(private readonly deps: {
    projectId: string;
    firebaseIdToken: string;
    bindings: DriverReviewRequestBindingPort;
    fetcher?: typeof fetch;
  }) {
    if (deps.projectId !== "tutorial-multi-language-70gx4j" || !deps.firebaseIdToken) {
      throw new CanonicalDriverReviewError("WRITE_RUNTIME_UNAVAILABLE", 503);
    }
  }
  async reserve(actorId: string, command: CanonicalDriverReviewCommand): Promise<string> {
    // Actor-scoped key, payload-bound across actions AND targets. Fixed field order.
    const key = digest(["driver-review-v1", actorId, command.idempotencyKey]);
    const fingerprint = digest([command.action, command.driverId, command.expectedCurrentState, command.reviewVersion, command.reason, [...command.fieldsToFix].sort()]);
    await this.deps.bindings.bind(key, fingerprint);
    return `adminnext_${key}`;
  }
  async review(command: CanonicalDriverReviewCommand, workflowKey: string): Promise<CanonicalDriverReviewReceipt> {
    const action = command.action === "needs_changes" ? "request_changes" : command.action;
    let response: Response;
    try {
      response = await (this.deps.fetcher ?? fetch)(`https://us-central1-${this.deps.projectId}.cloudfunctions.net/reviewDriverApplicationV2`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000),
        headers: { "content-type": "application/json", Authorization: `Bearer ${this.deps.firebaseIdToken}` },
        body: JSON.stringify({ data: { action, driverId: command.driverId, reviewVersion: command.reviewVersion, reason: command.reason, fieldsToFix: command.fieldsToFix, idempotencyKey: workflowKey } }),
      });
    } catch {
      // Unknown outcome: callers must retry the SAME key, never assume no write occurred.
      throw new CanonicalDriverReviewError("WRITE_OUTCOME_UNKNOWN", 503);
    }
    let payload: { result?: Record<string, unknown>; error?: { status?: string } };
    try { payload = await response.json(); } catch { throw new CanonicalDriverReviewError("WRITE_OUTCOME_UNKNOWN", 503); }
    if (!response.ok || payload.error) {
      const [code, status] = errorCodes[payload.error?.status ?? ""] ?? ["WRITE_OUTCOME_UNKNOWN", 503];
      throw new CanonicalDriverReviewError(code, status);
    }
    const result = payload.result;
    if (!result || result.ok !== true || result.driverId !== command.driverId || result.action !== action || result.registration_status !== statusForAction[command.action] || result.reviewVersion !== command.reviewVersion + 1) {
      throw new CanonicalDriverReviewError("WRITE_RECEIPT_MISMATCH", 503);
    }
    return { driverId: command.driverId, action: command.action, registrationStatus: statusForAction[command.action], reviewVersion: result.reviewVersion as number, replay: result.fromIdempotency === true };
  }
}

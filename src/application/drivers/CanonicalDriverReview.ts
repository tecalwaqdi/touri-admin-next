import { z } from "zod";
import type { AuthUser } from "@/types/auth";
import type { AccessScope } from "@/types/roles";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { assertDriverWriteRbac } from "@/application/controlled-writes/drivers/DriverWriteRbac";

export class CanonicalDriverReviewError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export const canonicalDriverReviewSchema = z.object({
  action: z.enum(["approve", "reject", "needs_changes"]),
  driverId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),
  expectedCurrentState: z.literal("pending_review"),
  reviewVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  reason: z.string().trim().max(280).default(""),
  fieldsToFix: z.array(z.enum(["national_id", "vehicle_registration", "driver_license", "other"])).max(4).default([]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{12,160}$/),
}).strict().superRefine((value, ctx) => {
  if (value.action !== "approve" && value.reason.length < 3) ctx.addIssue({ code: "custom", message: "Review reason required", path: ["reason"] });
  if (value.action !== "needs_changes" && value.fieldsToFix.length) ctx.addIssue({ code: "custom", message: "Correction fields require needs_changes", path: ["fieldsToFix"] });
});
export type CanonicalDriverReviewCommand = z.infer<typeof canonicalDriverReviewSchema>;
export type CanonicalDriverReviewReceipt = {
  driverId: string;
  action: CanonicalDriverReviewCommand["action"];
  registrationStatus: "approved" | "rejected" | "needs_changes";
  reviewVersion: number;
  replay: boolean;
};
export interface CanonicalDriverReviewRepository {
  /** Atomically bind the client key to the actor and complete payload before invoking the workflow. */
  reserve(actorId: string, command: CanonicalDriverReviewCommand): Promise<string>;
  /** Canonical workflow owns driver changes, atomic audit, concurrency and persistent result. */
  review(command: CanonicalDriverReviewCommand, workflowKey: string): Promise<CanonicalDriverReviewReceipt>;
}
export type DriverReviewTarget = {
  operationalDriver: boolean;
  countryId: string | null;
  cityId: string | null;
  agentId: string | null;
};
export type CanonicalDriverReviewDeps = {
  assertEnabled(): void;
  loadTarget(id: string): Promise<DriverReviewTarget | null>;
  repository: CanonicalDriverReviewRepository;
};

/** This service never synthesizes a precondition from a fresh read: the operator supplies the version seen. */
export async function executeCanonicalDriverReview(actor: AuthUser, raw: unknown, deps: CanonicalDriverReviewDeps) {
  const parsed = canonicalDriverReviewSchema.safeParse(raw);
  if (!parsed.success) throw new CanonicalDriverReviewError("VALIDATION_FAILED", 400);
  const command = parsed.data;
  assertDriverWriteRbac({ uid: actor.id, role: actor.role, permissions: actor.permissions, scope: actor.scope }, command.action);
  deps.assertEnabled();
  const target = await deps.loadTarget(command.driverId);
  if (!target?.operationalDriver) throw new CanonicalDriverReviewError("DRIVER_NOT_FOUND", 404);
  assertDriverReviewScope(actor.scope, target);
  // A replay still requires current RBAC, gate and target scope. The canonical
  // transaction alone decides replay vs stale version so response loss is retryable.
  const workflowKey = await deps.repository.reserve(actor.id, command);
  return deps.repository.review(command, workflowKey);
}
function assertDriverReviewScope(scope: AccessScope, target: DriverReviewTarget) {
  assertDetailResourceInScope(scope, target);
}

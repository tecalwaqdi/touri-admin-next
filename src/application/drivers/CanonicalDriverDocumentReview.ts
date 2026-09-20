import { z } from "zod";
import type { AuthUser } from "@/types/auth";
import type { AccessScope } from "@/types/roles";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { assertDriverWriteRbac } from "@/application/controlled-writes/drivers/DriverWriteRbac";
import {
  assertRegistrationAllowsDocumentReview,
  DRIVER_DOCUMENT_REVIEW_ACTIONS,
  DRIVER_DOCUMENT_REVIEW_SLOTS,
  toCfDocumentReviewAction,
  type DriverDocumentReviewAction,
  type DriverDocumentReviewSlot,
} from "@/domain/driver/DriverDocumentReview";

export class CanonicalDriverDocumentReviewError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export const canonicalDriverDocumentReviewSchema = z
  .object({
    action: z.enum(DRIVER_DOCUMENT_REVIEW_ACTIONS),
    driverId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),
    slot: z.enum(DRIVER_DOCUMENT_REVIEW_SLOTS),
    expectedDocumentVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    reason: z.string().trim().max(280).default(""),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{12,160}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action !== "approve" && value.reason.length < 3) {
      ctx.addIssue({
        code: "custom",
        message: "Review reason required",
        path: ["reason"],
      });
    }
  });

export type CanonicalDriverDocumentReviewCommand = z.infer<
  typeof canonicalDriverDocumentReviewSchema
>;

export type CanonicalDriverDocumentReviewReceipt = {
  driverId: string;
  slot: DriverDocumentReviewSlot;
  action: DriverDocumentReviewAction;
  reviewStatus: "approved" | "rejected" | "needs_changes";
  documentVersion: number;
  replay: boolean;
};

export type DriverDocumentReviewTarget = {
  operationalDriver: boolean;
  countryId: string | null;
  cityId: string | null;
  agentId: string | null;
  registrationStatus: string | null;
  submissionStatus: string | null;
  slotPresence: "present" | "missing" | "unknown";
  documentVersion: number;
  slotField: string;
};

export interface CanonicalDriverDocumentReviewRepository {
  reserve(
    actorId: string,
    command: CanonicalDriverDocumentReviewCommand,
  ): Promise<string>;
  review(
    command: CanonicalDriverDocumentReviewCommand,
    workflowKey: string,
    target: DriverDocumentReviewTarget,
  ): Promise<CanonicalDriverDocumentReviewReceipt>;
}

export type CanonicalDriverDocumentReviewDeps = {
  assertEnabled(): void;
  loadTarget(
    driverId: string,
    slot: DriverDocumentReviewSlot,
  ): Promise<DriverDocumentReviewTarget | null>;
  repository: CanonicalDriverDocumentReviewRepository;
};

const SLOT_FIELD: Record<DriverDocumentReviewSlot, string> = {
  national_id: "doc_national_id",
  driver_license: "doc_driver_license_front",
  driver_license_back: "doc_driver_license_back",
  vehicle_registration: "doc_vehicle_registration",
  vehicle_insurance: "doc_vehicle_insurance",
  vehicle_photo: "doc_vehicle_photo",
  profile_photo: "doc_profile_photo",
};

export function driverDocumentSlotField(
  slot: DriverDocumentReviewSlot,
): string {
  return SLOT_FIELD[slot];
}

export async function executeCanonicalDriverDocumentReview(
  actor: AuthUser,
  raw: unknown,
  deps: CanonicalDriverDocumentReviewDeps,
): Promise<CanonicalDriverDocumentReviewReceipt> {
  const parsed = canonicalDriverDocumentReviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CanonicalDriverDocumentReviewError("VALIDATION_FAILED", 400);
  }
  const command = parsed.data;
  assertDriverWriteRbac(
    {
      uid: actor.id,
      role: actor.role,
      permissions: actor.permissions,
      scope: actor.scope,
    },
    command.action === "needs_changes" ? "needs_changes" : command.action,
  );
  deps.assertEnabled();
  const target = await deps.loadTarget(command.driverId, command.slot);
  if (!target?.operationalDriver) {
    throw new CanonicalDriverDocumentReviewError("DRIVER_NOT_FOUND", 404);
  }
  assertDetailResourceInScope(actor.scope as AccessScope, target);
  try {
    assertRegistrationAllowsDocumentReview({
      registrationStatus: target.registrationStatus,
      submissionStatus: target.submissionStatus,
    });
  } catch {
    throw new CanonicalDriverDocumentReviewError("DRIVER_NOT_READY", 409);
  }
  if (target.slotPresence !== "present") {
    throw new CanonicalDriverDocumentReviewError("DOCUMENT_NOT_FOUND", 404);
  }
  if (target.documentVersion !== command.expectedDocumentVersion) {
    throw new CanonicalDriverDocumentReviewError("PRECONDITION_FAILED", 409);
  }
  const workflowKey = await deps.repository.reserve(actor.id, command);
  return deps.repository.review(command, workflowKey, target);
}

export { toCfDocumentReviewAction };

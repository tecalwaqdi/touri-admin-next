/**
 * Trip cancel Controlled Write — types & errors.
 * Action: cancel only. No create/edit/complete/refund.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";

export type TripControlledWriteAction = "cancel";

export type TripCancelReasonCode =
  | "operational"
  | "customer_request"
  | "safety"
  | "no_driver"
  | "payment_issue"
  | "other";

export type VerifiedTripWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type TripWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  TRIP_WRITE_ENABLED: boolean;
};

export type TripWriteSnapshot = {
  tripId: string;
  exists: boolean;
  lifecycleStatus: TripLifecycleStatus;
  countryId: string | null;
  customerId: string | null;
  preconditionToken: string;
};

export type CancelTripCommand = {
  action: "cancel";
  actor: VerifiedTripWriteActor;
  tripId: string;
  expectedLifecycleStatus: TripLifecycleStatus;
  reasonCode: TripCancelReasonCode;
  note?: string;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export type TripControlledWriteCommand = CancelTripCommand;

export const TRIP_WRITE_ERROR_CODES = [
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "TRIP_NOT_FOUND",
  "TRIP_ALREADY_TERMINAL",
  "INVALID_TRIP_STATE_TRANSITION",
  "PRECONDITION_FAILED",
  "VALIDATION_FAILED",
  "REASON_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type TripWriteErrorCode = (typeof TRIP_WRITE_ERROR_CODES)[number];

export function isTripWriteErrorCode(code: string): code is TripWriteErrorCode {
  return (TRIP_WRITE_ERROR_CODES as readonly string[]).includes(code);
}

export class TripWriteError extends Error {
  readonly code: TripWriteErrorCode;
  constructor(code: TripWriteErrorCode, message: string) {
    super(message);
    this.name = "TripWriteError";
    this.code = code;
  }
}

export type TripWriteCanonicalResponse =
  | {
      ok: true;
      status: "applied" | "idempotent_replay";
      action: "cancel";
      tripId: string;
      fromLifecycle: TripLifecycleStatus;
      toLifecycle: "cancelled_by_admin";
      productionWriteExecuted: boolean;
      customerLockCleared: boolean;
      auditIntentId?: string;
      auditResultId?: string;
      preconditionTokenAfter?: string;
    }
  | {
      ok: false;
      status: "denied" | "failed";
      code: TripWriteErrorCode;
      message: string;
      action: "cancel";
      tripId: string;
      productionWriteExecuted: false;
      auditIntentId?: string;
      auditResultId?: string;
    };

export type TripWriteApplyInput = {
  command: CancelTripCommand;
  snapshot: TripWriteSnapshot;
  fromLifecycle: TripLifecycleStatus;
};

export type TripWriteApplyResult = {
  tripId: string;
  fromLifecycle: TripLifecycleStatus;
  toLifecycle: "cancelled_by_admin";
  customerId: string | null;
  customerLockCleared: boolean;
  preconditionTokenAfter: string;
  appliedAtUtc: string;
};

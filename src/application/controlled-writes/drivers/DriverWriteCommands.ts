/**
 * Phase 5A — Driver Controlled Write command constructors.
 */

import type {
  ApproveDriverCommand,
  DriverChangesReasonCode,
  DriverRejectReasonCode,
  DriverSuspendReasonCode,
  ProvenDriverRegistrationState,
  RejectDriverCommand,
  RequestDriverChangesCommand,
  SuspendDriverCommand,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";

type BaseInput = {
  actor: VerifiedDriverWriteActor;
  driverId: string;
  expectedCurrentState: ProvenDriverRegistrationState;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export function createApproveDriverCommand(
  input: BaseInput,
): ApproveDriverCommand {
  return { ...input, action: "approve" };
}

export function createRejectDriverCommand(
  input: BaseInput & {
    reasonCode: DriverRejectReasonCode;
    note?: string;
  },
): RejectDriverCommand {
  return {
    ...input,
    action: "reject",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

export function createRequestDriverChangesCommand(
  input: BaseInput & {
    reasonCode: DriverChangesReasonCode;
    note?: string;
  },
): RequestDriverChangesCommand {
  return {
    ...input,
    action: "needs_changes",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

export function createSuspendDriverCommand(
  input: BaseInput & {
    reasonCode: DriverSuspendReasonCode;
    note?: string;
  },
): SuspendDriverCommand {
  return {
    ...input,
    action: "suspend",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

/** Aliases matching command type names for call-site readability. */
export {
  createApproveDriverCommand as approveDriver,
  createRejectDriverCommand as rejectDriver,
  createRequestDriverChangesCommand as requestDriverChanges,
  createSuspendDriverCommand as suspendDriver,
};

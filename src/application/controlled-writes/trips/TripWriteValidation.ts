import { canAdminCancelTripLifecycle } from "@/domain/trip/TripCancelPolicy";
import {
  TripWriteError,
  type CancelTripCommand,
  type TripCancelReasonCode,
  type TripWriteSnapshot,
} from "@/application/controlled-writes/trips/TripWriteTypes";

const REASONS: readonly TripCancelReasonCode[] = [
  "operational",
  "customer_request",
  "safety",
  "no_driver",
  "payment_issue",
  "other",
];

export function validateCancelTripCommand(command: CancelTripCommand): CancelTripCommand {
  if (!command.tripId?.trim()) {
    throw new TripWriteError("VALIDATION_FAILED", "tripId required");
  }
  if (!command.idempotencyKey?.trim()) {
    throw new TripWriteError("VALIDATION_FAILED", "idempotencyKey required");
  }
  if (!command.preconditionToken?.trim()) {
    throw new TripWriteError("VALIDATION_FAILED", "preconditionToken required");
  }
  if (!REASONS.includes(command.reasonCode)) {
    throw new TripWriteError("REASON_REQUIRED", "Valid reasonCode required");
  }
  const note =
    typeof command.note === "string"
      ? command.note.trim().slice(0, 280)
      : undefined;
  return { ...command, note: note || undefined };
}

export function assertCancelPreconditions(
  command: CancelTripCommand,
  snapshot: TripWriteSnapshot,
): void {
  if (!snapshot.exists) {
    throw new TripWriteError("TRIP_NOT_FOUND", `Trip ${command.tripId} not found`);
  }
  if (snapshot.preconditionToken !== command.preconditionToken) {
    throw new TripWriteError(
      "PRECONDITION_FAILED",
      "Trip concurrency token mismatch",
    );
  }
  if (command.expectedLifecycleStatus !== snapshot.lifecycleStatus) {
    throw new TripWriteError(
      "PRECONDITION_FAILED",
      `Expected lifecycle ${command.expectedLifecycleStatus}, found ${snapshot.lifecycleStatus}`,
    );
  }
  if (!canAdminCancelTripLifecycle(snapshot.lifecycleStatus)) {
    throw new TripWriteError(
      "TRIP_ALREADY_TERMINAL",
      `Trip lifecycle ${snapshot.lifecycleStatus} cannot be cancelled`,
    );
  }
}

export function createCancelTripCommand(input: {
  actor: CancelTripCommand["actor"];
  tripId: string;
  expectedLifecycleStatus: CancelTripCommand["expectedLifecycleStatus"];
  reasonCode: TripCancelReasonCode;
  note?: string;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
}): CancelTripCommand {
  return validateCancelTripCommand({
    action: "cancel",
    actor: input.actor,
    tripId: input.tripId,
    expectedLifecycleStatus: input.expectedLifecycleStatus,
    reasonCode: input.reasonCode,
    note: input.note,
    preconditionToken: input.preconditionToken,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
  });
}

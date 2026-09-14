/**
 * Phase 5A — Preconditions / concurrency for Driver Controlled Writes.
 * Load via canonical Driver snapshot. No last-write-wins.
 */

import type {
  DriverControlledWriteCommand,
  DriverWriteSnapshot,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";

export type DriverWriteLoadPort = {
  loadForWrite(driverId: string): Promise<DriverWriteSnapshot | null>;
};

/**
 * Validate existence, operational membership, expected state, token, country
 * unchanged (token + countryId on snapshot), and action-specific guards.
 */
export function evaluateDriverWritePreconditions(
  command: DriverControlledWriteCommand,
  snapshot: DriverWriteSnapshot | null,
): {
  snapshot: DriverWriteSnapshot;
  toState: import("./DriverWriteTypes").ProvenDriverRegistrationState;
} {
  if (!snapshot || !snapshot.exists) {
    throw new DriverWriteError(
      "DRIVER_NOT_FOUND",
      `Driver ${command.driverId} not found`,
    );
  }

  if (snapshot.driverId !== command.driverId) {
    throw new DriverWriteError(
      "PRECONDITION_FAILED",
      "Loaded driverId does not match command.driverId",
    );
  }

  if (!snapshot.isOperationalDriver) {
    throw new DriverWriteError(
      "NOT_OPERATIONAL_DRIVER",
      `Driver ${command.driverId} is not an operational Driver`,
    );
  }

  if (snapshot.registrationStatus !== command.expectedCurrentState) {
    throw new DriverWriteError(
      "PRECONDITION_FAILED",
      `expectedCurrentState=${command.expectedCurrentState} observed=${snapshot.registrationStatus}`,
    );
  }

  if (snapshot.preconditionToken !== command.preconditionToken) {
    throw new DriverWriteError(
      "PRECONDITION_FAILED",
      "preconditionToken mismatch (concurrency)",
    );
  }

  const transition = resolveDriverTransition(
    command.action,
    snapshot.registrationStatus,
  );
  if (!transition.ok) {
    throw new DriverWriteError(transition.code, transition.message);
  }

  if (command.action === "approve") {
    if (
      snapshot.registrationStatus === "pending_review" &&
      (snapshot.complianceStatus === "incomplete" ||
        snapshot.complianceStatus === "expired")
    ) {
      throw new DriverWriteError(
        "DRIVER_NOT_READY_FOR_APPROVAL",
        `Driver compliance=${snapshot.complianceStatus}`,
      );
    }
  }

  if (command.action === "suspend") {
    if (snapshot.tripState === "busy") {
      throw new DriverWriteError(
        "DRIVER_HAS_ACTIVE_TRIP",
        "Cannot suspend driver with active trip (no cascade cancel)",
      );
    }
  }

  return { snapshot, toState: transition.to };
}

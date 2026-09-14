/**
 * Admin Next Drivers write bridge — reuses FakeDriverWriteRepository +
 * ControlledWritesService. Syncs allowlisted registration state back to the
 * in-memory Driver read model. No UI→Firestore. No pilot path.
 */

import type { Driver } from "@/types/driver";
import type { ApprovalStatus } from "@/types/driver";
import type { InMemoryDriverRepository } from "@/repositories/in-memory/InMemoryDriverRepository";
import {
  FakeDriverWriteRepository,
  type DriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import type {
  DriverWriteApplyInput,
  DriverWriteApplyResult,
  DriverWriteSnapshot,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { toProvenDriverState } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

function approvalFor(
  status: ProvenDriverRegistrationState,
): ApprovalStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "suspended":
      return "suspended";
    default:
      return "pending";
  }
}

function snapshotFromDriver(driver: Driver, token: string): DriverWriteSnapshot {
  const registrationStatus = toProvenDriverState(driver.registrationStatus);
  return {
    driverId: driver.id,
    exists: true,
    isOperationalDriver: true,
    registrationStatus,
    accountEnabled:
      registrationStatus === "suspended" ? "disabled" : "enabled",
    complianceStatus: "ready",
    tripState: driver.availabilityStatus === "busy" ? "busy" : "idle",
    countryId: driver.countryId,
    countryScopeKind: "mapped",
    preconditionToken: token,
  };
}

function initialToken(driver: Driver): string {
  return `im_v0_${driver.id}_${driver.registrationStatus}`;
}

/**
 * DriverWriteRepository that applies via Fake then syncs registration to
 * InMemoryDriverRepository (Admin Next synthetic read model).
 */
export class BridgedDriverWriteRepository implements DriverWriteRepository {
  readonly kind = "fake_driver_write" as const;

  constructor(
    private readonly fake: FakeDriverWriteRepository,
    private readonly drivers: InMemoryDriverRepository,
  ) {}

  async apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult> {
    const result = await this.fake.apply(input);
    const current = await this.drivers.getById(result.driverId);
    if (!current) {
      throw new DriverWriteError(
        "DRIVER_NOT_FOUND",
        `Bridge sync missing ${result.driverId}`,
      );
    }
    await this.drivers.save({
      ...current,
      registrationStatus: result.toState as Driver["registrationStatus"],
      approvalStatus: approvalFor(result.toState),
      availabilityStatus:
        result.toState === "suspended"
          ? "unavailable"
          : current.availabilityStatus === "busy"
            ? "busy"
            : current.availabilityStatus,
    });
    return result;
  }
}

export class BridgedDriverWriteLoadPort implements DriverWriteLoadPort {
  constructor(
    private readonly fake: FakeDriverWriteRepository,
    private readonly drivers: InMemoryDriverRepository,
  ) {}

  async ensureSeeded(driverId: string): Promise<DriverWriteSnapshot | null> {
    const existing = this.fake.get(driverId);
    if (existing) return existing;

    const driver = await this.drivers.getById(driverId);
    if (!driver) return null;

    const snap = snapshotFromDriver(driver, initialToken(driver));
    this.fake.seed(snap);
    return snap;
  }

  async loadForWrite(driverId: string): Promise<DriverWriteSnapshot | null> {
    return this.ensureSeeded(driverId);
  }
}

export function createDriverWriteBridge(drivers: InMemoryDriverRepository): {
  fake: FakeDriverWriteRepository;
  repository: BridgedDriverWriteRepository;
  loadPort: BridgedDriverWriteLoadPort;
} {
  const fake = new FakeDriverWriteRepository();
  const loadPort = new BridgedDriverWriteLoadPort(fake, drivers);
  const repository = new BridgedDriverWriteRepository(fake, drivers);
  return { fake, repository, loadPort };
}

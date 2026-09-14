/**
 * Admin Next Drivers write API application service.
 * Builds Driver Controlled Write commands and routes through ControlledWritesService.
 */

import type { AuthUser } from "@/types/auth";
import type { ControlledWritesService } from "@/application/controlled-writes/ControlledWritesService";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import {
  createApproveDriverCommand,
  createRejectDriverCommand,
  createRequestDriverChangesCommand,
  createSuspendDriverCommand,
} from "@/application/controlled-writes/drivers/DriverWriteCommands";
import type {
  DriverChangesReasonCode,
  DriverControlledWriteAction,
  DriverRejectReasonCode,
  DriverSuspendReasonCode,
  DriverWriteCanonicalResponse,
  ProvenDriverRegistrationState,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { FacadeDenialResponse } from "@/application/controlled-writes/ControlledWritesService";
import { getRepositories } from "@/repositories/container";
import {
  getAdminControlledWritesRuntime,
} from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import type { Driver } from "@/types/driver";

export type DriverWriteApiAction = DriverControlledWriteAction;

export type DriverWriteApiInput = {
  action: DriverWriteApiAction;
  driverId: string;
  expectedCurrentState: ProvenDriverRegistrationState;
  reasonCode?: string;
  note?: string;
  idempotencyKey: string;
  correlationId: string;
};

function toActor(user: AuthUser): VerifiedDriverWriteActor {
  return {
    uid: user.id,
    role: user.role,
    permissions: user.permissions,
    scope: user.scope,
  };
}

export class DriverWriteApiService {
  constructor(
    private readonly controlledWrites: ControlledWritesService,
    private readonly loadPort: DriverWriteLoadPort,
    private readonly driversRead: {
      getById(id: string): Promise<Driver | null>;
    },
  ) {}

  async execute(
    actor: AuthUser,
    input: DriverWriteApiInput,
  ): Promise<
    | {
        ok: true;
        result: Extract<DriverWriteCanonicalResponse, { ok: true }>;
        driver: Driver;
      }
    | {
        ok: false;
        result:
          | Extract<DriverWriteCanonicalResponse, { ok: false }>
          | FacadeDenialResponse;
      }
  > {
    const loaded = await this.loadPort.loadForWrite(input.driverId);
    if (!loaded || !loaded.exists) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "denied",
          code: "DRIVER_NOT_FOUND",
          message: `Driver ${input.driverId} not found`,
          action: input.action,
          driverId: input.driverId,
          productionWriteExecuted: false,
        },
      };
    }

    const base = {
      actor: toActor(actor),
      driverId: input.driverId,
      expectedCurrentState: input.expectedCurrentState,
      preconditionToken: loaded.preconditionToken,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    };

    let command;
    switch (input.action) {
      case "approve":
        command = createApproveDriverCommand(base);
        break;
      case "reject":
        command = createRejectDriverCommand({
          ...base,
          reasonCode: (input.reasonCode as DriverRejectReasonCode) || "other",
          note: input.note,
        });
        break;
      case "needs_changes":
        command = createRequestDriverChangesCommand({
          ...base,
          reasonCode: (input.reasonCode as DriverChangesReasonCode) || "other",
          note: input.note,
        });
        break;
      case "suspend":
        command = createSuspendDriverCommand({
          ...base,
          reasonCode: (input.reasonCode as DriverSuspendReasonCode) || "other",
          note: input.note,
        });
        break;
    }

    const outcome = await this.controlledWrites.executeDriverCommand(command);
    if (!outcome.ok) {
      return { ok: false, result: outcome };
    }

    const driver = await this.driversRead.getById(input.driverId);
    if (!driver) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "failed",
          code: "INTERNAL_WRITE_FAILURE",
          message: "Driver missing after apply",
          action: input.action,
          driverId: input.driverId,
          productionWriteExecuted: false,
        },
      };
    }

    return { ok: true, result: outcome, driver };
  }
}

let apiSingleton: DriverWriteApiService | null = null;

export function getDriverWriteApiService(): DriverWriteApiService {
  if (!apiSingleton) {
    const repos = getRepositories();
    const runtime = getAdminControlledWritesRuntime({
      drivers: repos.drivers,
      agents: repos.agents,
      customers: repos.customers,
    });
    apiSingleton = new DriverWriteApiService(
      runtime.service,
      runtime.driverLoadPort,
      repos.drivers,
    );
  }
  return apiSingleton;
}

export function resetDriverWriteApiServiceForTests(): void {
  apiSingleton = null;
}

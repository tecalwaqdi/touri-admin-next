/**
 * Admin Next Customers write API — ControlledWritesService only.
 * Path: UI → API → executeCustomerCommand → Bridged Fake (hard-lock preserved).
 */

import type { AuthUser } from "@/types/auth";
import type { Customer } from "@/types/common";
import type { ControlledWritesService } from "@/application/controlled-writes/ControlledWritesService";
import type { CustomerWriteLoadPort } from "@/application/controlled-writes/customers/CustomerWritePreconditions";
import {
  createBlockCustomerCommand,
  createDisableCustomerCommand,
  createReactivateCustomerCommand,
} from "@/application/controlled-writes/customers/CustomerWriteCommands";
import type {
  CustomerBlockReasonCode,
  CustomerControlledWriteAction,
  CustomerDisableReasonCode,
  CustomerReactivateReasonCode,
  CustomerWriteCanonicalResponse,
  ProvenCustomerOperationalState,
  VerifiedCustomerWriteActor,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import type { FacadeDenialResponse } from "@/application/controlled-writes/ControlledWritesService";
import { getRepositories } from "@/repositories/container";
import { getAdminControlledWritesRuntime } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";

export type CustomerWriteApiAction = CustomerControlledWriteAction;

export type CustomerWriteApiInput = {
  action: CustomerWriteApiAction;
  customerId: string;
  expectedCurrentState: ProvenCustomerOperationalState;
  reasonCode?: string;
  note?: string;
  idempotencyKey: string;
  correlationId: string;
};

function toActor(user: AuthUser): VerifiedCustomerWriteActor {
  return {
    uid: user.id,
    role: user.role,
    permissions: user.permissions,
    scope: user.scope,
  };
}

export class CustomerWriteApiService {
  constructor(
    private readonly controlledWrites: ControlledWritesService,
    private readonly loadPort: CustomerWriteLoadPort,
    private readonly customersRead: {
      getById(id: string): Promise<Customer | null>;
    },
  ) {}

  async execute(
    actor: AuthUser,
    input: CustomerWriteApiInput,
  ): Promise<
    | {
        ok: true;
        result: Extract<CustomerWriteCanonicalResponse, { ok: true }>;
        customer: Customer;
      }
    | {
        ok: false;
        result:
          | Extract<CustomerWriteCanonicalResponse, { ok: false }>
          | FacadeDenialResponse;
      }
  > {
    const loaded = await this.loadPort.loadForWrite(input.customerId);
    if (!loaded || !loaded.exists) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "denied",
          code: "CUSTOMER_NOT_FOUND",
          message: `Customer ${input.customerId} not found`,
          action: input.action,
          customerId: input.customerId,
          productionWriteExecuted: false,
          authWriteExecuted: false,
        },
      };
    }

    const base = {
      actor: toActor(actor),
      customerId: input.customerId,
      expectedCurrentState: input.expectedCurrentState,
      preconditionToken: loaded.preconditionToken,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    };

    let command;
    switch (input.action) {
      case "disable":
        command = createDisableCustomerCommand({
          ...base,
          reasonCode:
            (input.reasonCode as CustomerDisableReasonCode) || "operational",
          note: input.note,
        });
        break;
      case "block":
        command = createBlockCustomerCommand({
          ...base,
          reasonCode:
            (input.reasonCode as CustomerBlockReasonCode) || "policy_violation",
          note: input.note,
        });
        break;
      case "reactivate":
        command = createReactivateCustomerCommand({
          ...base,
          reasonCode: input.reasonCode as CustomerReactivateReasonCode | undefined,
          note: input.note,
        });
        break;
    }

    const outcome = await this.controlledWrites.executeCustomerCommand(command);
    if (!outcome.ok) {
      return { ok: false, result: outcome };
    }

    let customer = await this.customersRead.getById(input.customerId);
    if (!customer) {
      // Production path: in-memory catalog may not contain the live customer.
      const toState = outcome.toState;
      const status =
        toState === "enabled"
          ? "active"
          : toState === "blocked"
            ? "blocked"
            : "inactive";
      customer = {
        id: input.customerId,
        name: input.customerId.slice(0, 12),
        phone: "",
        email: "",
        countryId: loaded.countryId || "unknown",
        cityId: "",
        tripCount: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        status,
        createdAtUtc: new Date().toISOString(),
      };
    }

    return { ok: true, result: outcome, customer };
  }
}

let apiSingleton: CustomerWriteApiService | null = null;

export function getCustomerWriteApiService(): CustomerWriteApiService {
  if (!apiSingleton) {
    const repos = getRepositories();
    const runtime = getAdminControlledWritesRuntime({
      drivers: repos.drivers,
      agents: repos.agents,
      customers: repos.customers,
    });
    apiSingleton = new CustomerWriteApiService(
      runtime.service,
      runtime.customerLoadPort,
      repos.customers,
    );
  }
  return apiSingleton;
}

export function resetCustomerWriteApiServiceForTests(): void {
  apiSingleton = null;
}

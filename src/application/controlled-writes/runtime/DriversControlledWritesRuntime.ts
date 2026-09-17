/**
 * Admin Next Controlled Writes runtime — Drivers + Agents + Customers.
 * Production: REAL Production*WriteRepository + gates from env (default FALSE).
 * Development offline: Bridged Fake only when chrome + read-disabled.
 */

import {
  createControlledWritesService,
  type ControlledWritesService,
} from "@/application/controlled-writes/ControlledWritesService";
import { DEFAULT_CONSOLIDATION_FLAGS_FALSE } from "@/application/controlled-writes/ControlledWriteConsolidationGates";
import { InMemoryConsolidatedIdempotencyStore } from "@/application/controlled-writes/ControlledWriteConsolidatedIdempotency";
import { InMemoryConsolidatedAuditPort } from "@/application/controlled-writes/ControlledWriteConsolidatedAudit";
import { InMemoryDriverWriteIdempotencyStore } from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import { InMemoryDriverWriteAuditPort } from "@/application/controlled-writes/drivers/DriverWriteAudit";
import {
  createDriverWriteBridge,
} from "@/application/controlled-writes/runtime/DriverAdminWriteBridge";
import {
  createAgentWriteBridge,
  type BridgedAgentWriteLoadPort,
} from "@/application/controlled-writes/runtime/AgentAdminWriteBridge";
import {
  createCustomerWriteBridge,
  type BridgedCustomerWriteLoadPort,
} from "@/application/controlled-writes/runtime/CustomerAdminWriteBridge";
import { InMemoryAgentWriteIdempotencyStore } from "@/application/controlled-writes/agents/AgentWriteIdempotency";
import { InMemoryAgentWriteAuditPort } from "@/application/controlled-writes/agents/AgentWriteAudit";
import { InMemoryCustomerWriteIdempotencyStore } from "@/application/controlled-writes/customers/CustomerWriteIdempotency";
import { InMemoryCustomerWriteAuditPort } from "@/application/controlled-writes/customers/CustomerWriteAudit";
import { createProductionRuntimeDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { createProductionDriverWriteLoadPort } from "@/application/controlled-writes/drivers/ProductionDriverWriteLoadPort";
import { createProductionRuntimeAgentWriteRepository } from "@/application/controlled-writes/agents/AgentWriteRepository";
import { createProductionRuntimeCustomerWriteRepository } from "@/application/controlled-writes/customers/CustomerWriteRepository";
import { areDriverProductionWritesEnabled } from "@/application/controlled-writes/drivers/DriverWriteFlags";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { InMemoryDriverRepository } from "@/repositories/in-memory/InMemoryDriverRepository";
import type { InMemoryAgentRepository } from "@/repositories/in-memory/InMemoryAgentRepository";
import type { InMemoryCustomerRepository } from "@/repositories/in-memory/InMemoryCustomerRepository";
import type { DriverWriteFlagGate } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { AgentWriteFlagGate } from "@/application/controlled-writes/agents/AgentWriteTypes";
import type { CustomerWriteFlagGate } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { getEnv } from "@/config/env";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

function snapshotFlagsFromEnv(): {
  driver: DriverWriteFlagGate;
  agent: AgentWriteFlagGate;
  customer: CustomerWriteFlagGate;
  allowOffline: boolean;
} {
  const env = getEnv();
  const allowOffline =
    env.APP_ENV === "development" &&
    env.PRODUCTION_READ_MODE === "disabled" &&
    isControlledWriteChromeEnabled();
  return {
    driver: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    },
    agent: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    },
    customer: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
      CUSTOMER_AUTH_WRITE_ENABLED: env.CUSTOMER_AUTH_WRITE_ENABLED,
    },
    allowOffline,
  };
}

export const DRIVERS_PRODUCTION_ROLLOUT = {
  status: "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeDriverCommand → ProductionDriverWriteRepository",
  productionFirestoreHardLockPreserved: false,
  phase5m5nUntouched: true,
} as const;

export const AGENTS_PRODUCTION_ROLLOUT = {
  status: "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeAgentCommand → ProductionAgentWriteRepository",
  productionFirestoreHardLockPreserved: false,
  phase5m5nUntouched: true,
  financeUntouched: true,
  customersUntouched: true,
} as const;

export const CUSTOMERS_PRODUCTION_ROLLOUT = {
  status: "CLOSED" as "OPEN" | "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeCustomerCommand → ProductionCustomerWriteRepository",
  productionFirestoreHardLockPreserved: false,
  phase5m5nUntouched: true,
  driversUntouched: true,
  agentsUntouched: true,
  financeUntouched: true,
  authWriteEnabled: false,
  actions: ["disable", "block", "reactivate"] as const,
};

type AdminWritesRuntime = {
  service: ControlledWritesService;
  driverLoadPort: DriverWriteLoadPort;
  agentLoadPort: BridgedAgentWriteLoadPort;
  customerLoadPort: BridgedCustomerWriteLoadPort;
};

let singleton: AdminWritesRuntime | null = null;

export function createAdminControlledWritesRuntime(input: {
  drivers: InMemoryDriverRepository;
  agents: InMemoryAgentRepository;
  customers: InMemoryCustomerRepository;
}): AdminWritesRuntime {
  const { driver, agent, customer, allowOffline } = snapshotFlagsFromEnv();
  const driverBridge = createDriverWriteBridge(input.drivers);
  const agentBridge = createAgentWriteBridge(input.agents);
  const customerBridge = createCustomerWriteBridge(input.customers);

  const driverWifPort =
    !allowOffline && areDriverProductionWritesEnabled(driver)
      ? createWifWritePortOrThrow("driver_review")
      : undefined;

  const driverRepo = allowOffline
    ? driverBridge.repository
    : createProductionRuntimeDriverWriteRepository(driver, driverWifPort);
  const driverLoadPort =
    allowOffline || !driverWifPort
      ? driverBridge.loadPort
      : createProductionDriverWriteLoadPort(driverWifPort);
  const agentRepo = allowOffline
    ? agentBridge.repository
    : createProductionRuntimeAgentWriteRepository(
        agent,
        agent.GLOBAL_PRODUCTION_WRITE_ENABLED &&
          agent.PRODUCTION_WRITE_ENABLED &&
          agent.AGENT_WRITE_ENABLED
          ? createWifWritePortOrThrow("ops_writer")
          : undefined,
      );
  const customerRepo = allowOffline
    ? customerBridge.repository
    : createProductionRuntimeCustomerWriteRepository(
        customer,
        customer.GLOBAL_PRODUCTION_WRITE_ENABLED &&
          customer.PRODUCTION_WRITE_ENABLED &&
          customer.CUSTOMER_WRITE_ENABLED
          ? createWifWritePortOrThrow("ops_writer")
          : undefined,
      );

  const service = createControlledWritesService({
    driver: {
      flags: allowOffline
        ? {
            GLOBAL_PRODUCTION_WRITE_ENABLED: false,
            DRIVER_WRITE_ENABLED: false,
            PRODUCTION_WRITE_ENABLED: false,
          }
        : driver,
      loadPort: driverLoadPort,
      repository: driverRepo,
      idempotency: new InMemoryDriverWriteIdempotencyStore(),
      audit: new InMemoryDriverWriteAuditPort(),
      allowOfflineExecution: allowOffline,
    },
    agent: {
      flags: allowOffline
        ? {
            GLOBAL_PRODUCTION_WRITE_ENABLED: false,
            PRODUCTION_WRITE_ENABLED: false,
            AGENT_WRITE_ENABLED: false,
          }
        : agent,
      loadPort: agentBridge.loadPort,
      repository: agentRepo,
      idempotency: new InMemoryAgentWriteIdempotencyStore(),
      audit: new InMemoryAgentWriteAuditPort(),
      allowOfflineExecution: allowOffline,
    },
    customer: {
      flags: allowOffline
        ? {
            GLOBAL_PRODUCTION_WRITE_ENABLED: false,
            PRODUCTION_WRITE_ENABLED: false,
            CUSTOMER_WRITE_ENABLED: false,
            CUSTOMER_AUTH_WRITE_ENABLED: false,
          }
        : customer,
      loadPort: customerBridge.loadPort,
      repository: customerRepo,
      idempotency: new InMemoryCustomerWriteIdempotencyStore(),
      audit: new InMemoryCustomerWriteAuditPort(),
      allowOfflineExecution: allowOffline,
    },
    flags: allowOffline
      ? DEFAULT_CONSOLIDATION_FLAGS_FALSE
      : {
          GLOBAL_PRODUCTION_WRITE_ENABLED: driver.GLOBAL_PRODUCTION_WRITE_ENABLED,
          PRODUCTION_WRITE_ENABLED: driver.PRODUCTION_WRITE_ENABLED === true,
          DRIVER_WRITE_ENABLED: driver.DRIVER_WRITE_ENABLED,
          AGENT_WRITE_ENABLED: agent.AGENT_WRITE_ENABLED,
          CUSTOMER_WRITE_ENABLED: customer.CUSTOMER_WRITE_ENABLED,
          FINANCE_WRITE_ENABLED: false,
        },
    sharedIdempotency: new InMemoryConsolidatedIdempotencyStore(),
    consolidatedAudit: new InMemoryConsolidatedAuditPort(),
    allowOfflineExecution: allowOffline,
  });
  return {
    service,
    driverLoadPort,
    agentLoadPort: agentBridge.loadPort,
    customerLoadPort: customerBridge.loadPort,
  };
}

export function getAdminControlledWritesRuntime(input: {
  drivers: InMemoryDriverRepository;
  agents: InMemoryAgentRepository;
  customers: InMemoryCustomerRepository;
}): AdminWritesRuntime {
  if (!singleton) {
    singleton = createAdminControlledWritesRuntime(input);
  }
  return singleton;
}

export function getDriversControlledWritesRuntime(
  drivers: InMemoryDriverRepository,
  agents: InMemoryAgentRepository,
  customers: InMemoryCustomerRepository,
): { service: ControlledWritesService; loadPort: DriverWriteLoadPort } {
  const runtime = getAdminControlledWritesRuntime({ drivers, agents, customers });
  return { service: runtime.service, loadPort: runtime.driverLoadPort };
}

export function resetDriversControlledWritesRuntimeForTests(): void {
  singleton = null;
}

export function resetAdminControlledWritesRuntimeForTests(): void {
  singleton = null;
}

/**
 * Admin Next Controlled Writes runtime — Drivers + Agents + Customers bridges
 * behind ControlledWritesService. Offline/synthetic while Production hard-locks remain.
 * Does not touch Phase 5M/5N pilot adapters.
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
  type BridgedDriverWriteLoadPort,
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
import type { InMemoryDriverRepository } from "@/repositories/in-memory/InMemoryDriverRepository";
import type { InMemoryAgentRepository } from "@/repositories/in-memory/InMemoryAgentRepository";
import type { InMemoryCustomerRepository } from "@/repositories/in-memory/InMemoryCustomerRepository";
import type { DriverWriteFlagGate } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { AgentWriteFlagGate } from "@/application/controlled-writes/agents/AgentWriteTypes";
import type { CustomerWriteFlagGate } from "@/application/controlled-writes/customers/CustomerWriteTypes";

const DRIVER_FLAGS_OFF: DriverWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
};

const AGENT_FLAGS_OFF: AgentWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
};

const CUSTOMER_FLAGS_OFF: CustomerWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
};

export const DRIVERS_PRODUCTION_ROLLOUT = {
  status: "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeDriverCommand → Bridged Fake",
  productionFirestoreHardLockPreserved: true,
  phase5m5nUntouched: true,
} as const;

export const AGENTS_PRODUCTION_ROLLOUT = {
  status: "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeAgentCommand → Bridged Fake",
  productionFirestoreHardLockPreserved: true,
  phase5m5nUntouched: true,
  financeUntouched: true,
  customersUntouched: true,
} as const;

/** Set to CLOSED after Customers Production Rollout validation PASS. */
export const CUSTOMERS_PRODUCTION_ROLLOUT = {
  status: "CLOSED" as "OPEN" | "CLOSED",
  closedAtUtc: "2026-09-13T00:00:00.000Z",
  path: "UI → API → ControlledWritesService.executeCustomerCommand → Bridged Fake",
  productionFirestoreHardLockPreserved: true,
  phase5m5nUntouched: true,
  driversUntouched: true,
  agentsUntouched: true,
  financeUntouched: true,
  authWriteEnabled: false,
  actions: ["disable", "block", "reactivate"] as const,
};

type AdminWritesRuntime = {
  service: ControlledWritesService;
  driverLoadPort: BridgedDriverWriteLoadPort;
  agentLoadPort: BridgedAgentWriteLoadPort;
  customerLoadPort: BridgedCustomerWriteLoadPort;
};

let singleton: AdminWritesRuntime | null = null;

export function createAdminControlledWritesRuntime(input: {
  drivers: InMemoryDriverRepository;
  agents: InMemoryAgentRepository;
  customers: InMemoryCustomerRepository;
}): AdminWritesRuntime {
  const driverBridge = createDriverWriteBridge(input.drivers);
  const agentBridge = createAgentWriteBridge(input.agents);
  const customerBridge = createCustomerWriteBridge(input.customers);
  const service = createControlledWritesService({
    driver: {
      flags: DRIVER_FLAGS_OFF,
      loadPort: driverBridge.loadPort,
      repository: driverBridge.repository,
      idempotency: new InMemoryDriverWriteIdempotencyStore(),
      audit: new InMemoryDriverWriteAuditPort(),
      allowOfflineExecution: true,
    },
    agent: {
      flags: AGENT_FLAGS_OFF,
      loadPort: agentBridge.loadPort,
      repository: agentBridge.repository,
      idempotency: new InMemoryAgentWriteIdempotencyStore(),
      audit: new InMemoryAgentWriteAuditPort(),
      allowOfflineExecution: true,
    },
    customer: {
      flags: CUSTOMER_FLAGS_OFF,
      loadPort: customerBridge.loadPort,
      repository: customerBridge.repository,
      idempotency: new InMemoryCustomerWriteIdempotencyStore(),
      audit: new InMemoryCustomerWriteAuditPort(),
      allowOfflineExecution: true,
    },
    flags: DEFAULT_CONSOLIDATION_FLAGS_FALSE,
    sharedIdempotency: new InMemoryConsolidatedIdempotencyStore(),
    consolidatedAudit: new InMemoryConsolidatedAuditPort(),
    allowOfflineExecution: true,
  });
  return {
    service,
    driverLoadPort: driverBridge.loadPort,
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
): { service: ControlledWritesService; loadPort: BridgedDriverWriteLoadPort } {
  const runtime = getAdminControlledWritesRuntime({ drivers, agents, customers });
  return { service: runtime.service, loadPort: runtime.driverLoadPort };
}

export function resetDriversControlledWritesRuntimeForTests(): void {
  singleton = null;
}

export function resetAdminControlledWritesRuntimeForTests(): void {
  singleton = null;
}

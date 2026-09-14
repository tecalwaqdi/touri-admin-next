/**
 * Admin Next Customers write bridge — reuses FakeCustomerWriteRepository +
 * ControlledWritesService. Syncs operational status back to the in-memory
 * Customer read model. No UI→Firestore. No Auth mutation.
 */

import type { Customer } from "@/types/common";
import type { InMemoryCustomerRepository } from "@/repositories/in-memory/InMemoryCustomerRepository";
import {
  FakeCustomerWriteRepository,
  type CustomerWriteRepository,
} from "@/application/controlled-writes/customers/CustomerWriteRepository";
import type { CustomerWriteLoadPort } from "@/application/controlled-writes/customers/CustomerWritePreconditions";
import type {
  CustomerWriteApplyInput,
  CustomerWriteApplyResult,
  CustomerWriteSnapshot,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

/** Map Admin Next Customer.status ↔ ProvenCustomerOperationalState. */
export function customerStatusToOperational(
  status: Customer["status"],
): ProvenCustomerOperationalState {
  switch (status) {
    case "active":
      return "enabled";
    case "inactive":
      return "disabled";
    case "blocked":
      return "blocked";
    default:
      return "unknown";
  }
}

export function operationalToCustomerStatus(
  state: ProvenCustomerOperationalState,
): Customer["status"] {
  switch (state) {
    case "enabled":
      return "active";
    case "disabled":
      return "inactive";
    case "blocked":
      return "blocked";
    default:
      return "inactive";
  }
}

function snapshotFromCustomer(
  customer: Customer,
  token: string,
): CustomerWriteSnapshot {
  const operationalState = customerStatusToOperational(customer.status);
  return {
    customerId: customer.id,
    exists: true,
    isOperationalCustomer: true,
    isCustomerCandidate: true,
    hasPositiveCustomerEvidence: true,
    excludedNonCustomer: false,
    excludedUnknownIdentity: false,
    mappingStatus: "operational",
    conflictingRole: "none",
    operationalState,
    accountEnabled:
      operationalState === "enabled" ? "enabled" : "disabled",
    tripState: "idle",
    countryId: customer.countryId,
    countryScopeKind: "mapped",
    preconditionToken: token,
  };
}

function initialToken(customer: Customer): string {
  return `im_v0_${customer.id}_${customer.status}`;
}

export class BridgedCustomerWriteRepository implements CustomerWriteRepository {
  readonly kind = "fake_customer_write" as const;

  constructor(
    private readonly fake: FakeCustomerWriteRepository,
    private readonly customers: InMemoryCustomerRepository,
  ) {}

  async apply(input: CustomerWriteApplyInput): Promise<CustomerWriteApplyResult> {
    const result = await this.fake.apply(input);
    const current = await this.customers.getById(result.customerId);
    if (!current) {
      throw new CustomerWriteError(
        "CUSTOMER_NOT_FOUND",
        `Bridge sync missing ${result.customerId}`,
      );
    }
    await this.customers.save({
      ...current,
      status: operationalToCustomerStatus(result.toState),
    });
    return result;
  }
}

export class BridgedCustomerWriteLoadPort implements CustomerWriteLoadPort {
  constructor(
    private readonly fake: FakeCustomerWriteRepository,
    private readonly customers: InMemoryCustomerRepository,
  ) {}

  async ensureSeeded(customerId: string): Promise<CustomerWriteSnapshot | null> {
    const existing = this.fake.get(customerId);
    if (existing) return existing;

    const customer = await this.customers.getById(customerId);
    if (!customer) return null;

    const snap = snapshotFromCustomer(customer, initialToken(customer));
    this.fake.seed(snap);
    return snap;
  }

  async loadForWrite(customerId: string): Promise<CustomerWriteSnapshot | null> {
    return this.ensureSeeded(customerId);
  }

  /** Test helper — expose fake for trip-state / force-state scenarios. */
  getFake(): FakeCustomerWriteRepository {
    return this.fake;
  }
}

export function createCustomerWriteBridge(
  customers: InMemoryCustomerRepository,
): {
  fake: FakeCustomerWriteRepository;
  repository: BridgedCustomerWriteRepository;
  loadPort: BridgedCustomerWriteLoadPort;
} {
  const fake = new FakeCustomerWriteRepository();
  const loadPort = new BridgedCustomerWriteLoadPort(fake, customers);
  const repository = new BridgedCustomerWriteRepository(fake, customers);
  return { fake, repository, loadPort };
}

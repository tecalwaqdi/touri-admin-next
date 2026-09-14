/**
 * Ports for FR1 registry fixture create-only provisioning.
 * Fake for offline tests; Firebase ADC for live operator path.
 */

export type FinanceFr1RegistryFixtureDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr1RegistryFixtureCreateResult =
  | { ok: true }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr1RegistryFixtureFirestorePort = {
  getRegistryDoc(): Promise<FinanceFr1RegistryFixtureDocSnap>;
  getIdempotencyDoc(): Promise<FinanceFr1RegistryFixtureDocSnap>;
  /** Create-only. Never merge/overwrite. */
  createRegistryDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr1RegistryFixtureCreateResult>;
  /** Create-only. Never merge/overwrite. */
  createIdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr1RegistryFixtureCreateResult>;
  /** Forbidden-collection touch counters for offline proof (always 0 on real). */
  forbiddenTouchCounts(): {
    order: number;
    financial_settlements: number;
    settlement_payments: number;
    finance_accounting_snapshots: number;
    finance_audit_events: number;
    drivers: number;
    agents: number;
    customers: number;
    user: number;
    auth: number;
  };
};

export type FinanceFr1AdcCredentialType =
  | "authorized_user"
  | "service_account"
  | "impersonated_service_account"
  | "unknown";

export type FinanceFr1AdcPrincipalVerification = "PASS" | "FAIL";

export type FinanceFr1AdcPrincipalResolution = {
  credentialType: FinanceFr1AdcCredentialType;
  principalEmail: string | null;
};

export type FinanceFr1RegistryFixtureAdcPrincipalResolver = {
  resolvePrincipal(): Promise<FinanceFr1AdcPrincipalResolution>;
};

export type FinanceFr1RegistryFixtureIamPermissionTester = {
  testIamPermissions(input: {
    projectId: string;
    permissions: readonly string[];
  }): Promise<readonly string[]>;
};

export function createFakeFinanceFr1RegistryFixtureFirestorePort(seed?: {
  registry?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
}): FinanceFr1RegistryFixtureFirestorePort & {
  registryWrites: number;
  idempotencyWrites: number;
  setRegistry(data: Record<string, unknown> | null): void;
  setIdempotency(data: Record<string, unknown> | null): void;
} {
  let registry: Record<string, unknown> | null = seed?.registry ?? null;
  let idempotency: Record<string, unknown> | null = seed?.idempotency ?? null;
  let registryWrites = 0;
  let idempotencyWrites = 0;

  return {
    get registryWrites() {
      return registryWrites;
    },
    get idempotencyWrites() {
      return idempotencyWrites;
    },
    setRegistry(data) {
      registry = data;
    },
    setIdempotency(data) {
      idempotency = data;
    },
    async getRegistryDoc() {
      return {
        exists: registry != null,
        data: registry,
      };
    },
    async getIdempotencyDoc() {
      return {
        exists: idempotency != null,
        data: idempotency,
      };
    },
    async createRegistryDoc(data) {
      if (registry != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "registry already exists",
        };
      }
      registry = { ...data };
      registryWrites += 1;
      return { ok: true };
    },
    async createIdempotencyDoc(data) {
      if (idempotency != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "idempotency already exists",
        };
      }
      idempotency = { ...data };
      idempotencyWrites += 1;
      return { ok: true };
    },
    forbiddenTouchCounts() {
      return {
        order: 0,
        financial_settlements: 0,
        settlement_payments: 0,
        finance_accounting_snapshots: 0,
        finance_audit_events: 0,
        drivers: 0,
        agents: 0,
        customers: 0,
        user: 0,
        auth: 0,
      };
    },
  };
}

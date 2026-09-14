/**
 * Phase 4A-0/4A-1 — DI containers.
 * createDevelopmentContainer / createShadowReadContainer ONLY.
 * DO NOT create createProductionWriteContainer.
 *
 * Shadow container: verified-token-capable identity path + Production read
 * repos wired to FakeFirestoreReadClient by default (Production path disabled).
 * ALL writes = Disabled*. No settlement/ledger/mutation registration.
 */

import {
  FakeProductionIdentityVerifier,
  type ProductionIdentityVerifier,
} from "@/domain/auth/ProductionIdentityVerifier";
import {
  DisabledAgentMutationPort,
  DisabledDriverMutationPort,
  DisabledLedgerCommandPort,
  DisabledSettlementCommandPort,
  DisabledWriteRepository,
} from "@/infrastructure/production/DisabledWriteRepository";
import { createFakeProductionReadRepositories } from "@/infrastructure/production/fakes/FakeProductionReadRepositories";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ProductionReadRepositories } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ShadowComparisonService } from "@/infrastructure/production/ShadowComparisonService";
import { DefaultShadowComparisonService } from "@/infrastructure/production/ShadowComparisonService";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import {
  createProductionReadObservability,
  InMemoryProductionReadObservability,
} from "@/infrastructure/production/ObservabilityEvents";
import type { ProductionReadCircuitBreaker } from "@/infrastructure/production/CircuitBreakerDesign";
import { InMemoryProductionReadCircuitBreaker } from "@/infrastructure/production/CircuitBreakerDesign";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";

export type DevelopmentContainer = {
  kind: "development";
  identityVerifier: ProductionIdentityVerifier;
  /** Synthetic in-memory path remains outside this container (existing getRepositories). */
  productionReads: null;
  writes: DisabledWriteRepository;
  settlementCommands: DisabledSettlementCommandPort;
  ledgerCommands: DisabledLedgerCommandPort;
  driverMutations: DisabledDriverMutationPort;
  agentMutations: DisabledAgentMutationPort;
};

export type ShadowReadContainer = {
  kind: "shadow_read";
  identityVerifier: ProductionIdentityVerifier;
  productionReads: ProductionReadRepositories;
  firestoreReadClient: FirestoreReadClient;
  writes: DisabledWriteRepository;
  settlementCommands: DisabledSettlementCommandPort;
  ledgerCommands: DisabledLedgerCommandPort;
  driverMutations: DisabledDriverMutationPort;
  agentMutations: DisabledAgentMutationPort;
  comparison: ShadowComparisonService;
  observability: ProductionReadObservability;
  circuitBreaker: ProductionReadCircuitBreaker;
  /** Explicit absence — write container must not exist. */
  productionWriteRepos: never | null;
  /** Kill switch mirror — dynamic per request when false. */
  productionReadEnabled: boolean;
  fullPiiShadowEnabled: false;
  liveShadowAllowedResources: ReadonlySet<string>;
};

export function createDevelopmentContainer(): DevelopmentContainer {
  return {
    kind: "development",
    identityVerifier: new FakeProductionIdentityVerifier(),
    productionReads: null,
    writes: new DisabledWriteRepository(),
    settlementCommands: new DisabledSettlementCommandPort(),
    ledgerCommands: new DisabledLedgerCommandPort(),
    driverMutations: new DisabledDriverMutationPort(),
    agentMutations: new DisabledAgentMutationPort(),
  };
}

/**
 * Shadow read DI.
 * productionReadEnabled defaults FALSE — kill switch rejects repo calls.
 * Uses FakeFirestoreReadClient by default (no Production network).
 * Optionally accept pre-seeded client / identity verifier for tests.
 */
export function createShadowReadContainer(options?: {
  productionReadEnabled?: boolean;
  identityVerifier?: ProductionIdentityVerifier;
  firestoreReadClient?: FirestoreReadClient;
  /** When true, use empty FakeProductionReadRepositories (design stub). Default: wired repos. */
  useEmptyFakeRepos?: boolean;
  observability?: ProductionReadObservability;
  circuitBreaker?: ProductionReadCircuitBreaker;
  comparison?: ShadowComparisonService;
  /**
   * Phase 4A-1 live allowlist. When omitted and productionReadEnabled,
   * defaults to countries-only. When productionReadEnabled=false, empty.
   * Pass `null` to skip resource gate (unit Fake repo tests that enable kill switch).
   */
  liveShadowAllowedResources?: ReadonlySet<string> | null;
  observabilitySink?: "memory" | "structured_logger" | "file_ndjson";
  observabilityFilePath?: string;
}): ShadowReadContainer {
  const productionReadEnabled = options?.productionReadEnabled ?? false;
  const observability =
    options?.observability ??
    (options?.observabilitySink
      ? createProductionReadObservability({
          sink: options.observabilitySink,
          filePath: options.observabilityFilePath,
        })
      : new InMemoryProductionReadObservability());
  const client = options?.firestoreReadClient ?? new FakeFirestoreReadClient();

  const liveShadowAllowedResources =
    options?.liveShadowAllowedResources === null
      ? undefined
      : (options?.liveShadowAllowedResources ??
        (productionReadEnabled
          ? parseLiveShadowAllowedResources("countries")
          : new Set<string>()));

  const productionReads = options?.useEmptyFakeRepos
    ? createFakeProductionReadRepositories({ productionReadEnabled })
    : createProductionReadRepositories({
        client,
        productionReadEnabled,
        fullPiiShadowEnabled: false,
        observability,
        liveShadowAllowedResources,
      });

  return {
    kind: "shadow_read",
    identityVerifier:
      options?.identityVerifier ?? new FakeProductionIdentityVerifier(),
    productionReads,
    firestoreReadClient: client,
    writes: new DisabledWriteRepository(),
    settlementCommands: new DisabledSettlementCommandPort(),
    ledgerCommands: new DisabledLedgerCommandPort(),
    driverMutations: new DisabledDriverMutationPort(),
    agentMutations: new DisabledAgentMutationPort(),
    comparison: options?.comparison ?? new DefaultShadowComparisonService(),
    observability,
    circuitBreaker:
      options?.circuitBreaker ?? new InMemoryProductionReadCircuitBreaker(),
    productionWriteRepos: null,
    productionReadEnabled,
    fullPiiShadowEnabled: false,
    liveShadowAllowedResources: liveShadowAllowedResources ?? new Set(),
  };
}

/** Compile-time / runtime proof: must not export a write container factory. */
export const PHASE4_FORBIDDEN_FACTORY_NAMES = [
  "createProductionWriteContainer",
] as const;

export function assertNoProductionWriteContainerFactory(
  exports: Record<string, unknown>,
): void {
  for (const name of PHASE4_FORBIDDEN_FACTORY_NAMES) {
    if (typeof exports[name] === "function") {
      throw new Error(`Forbidden factory present: ${name}`);
    }
  }
}

/**
 * Shadow container must not register mutation services.
 */
export function assertShadowHasNoMutationServices(
  container: ShadowReadContainer,
): void {
  if (container.productionWriteRepos != null) {
    throw new Error("Shadow container must not register productionWriteRepos");
  }
  if (!(container.writes instanceof DisabledWriteRepository)) {
    throw new Error("Shadow writes must be DisabledWriteRepository");
  }
}

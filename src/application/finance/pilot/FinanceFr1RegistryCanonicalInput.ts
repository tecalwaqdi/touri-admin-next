/**
 * Isolated FR1 registry fixture → SAME canonical Finance domain input used after
 * order mapping. One calculation path: mapOrderToTripFinancialSnapshot.
 *
 * Registry MUST NOT become financial SoT, order replacement, real-trip fallback,
 * third accounting book, UI-accessible accounting source, or general Production
 * ingestion. Gate: FINANCE_FR1_REGISTRY_PILOT=1.
 */

import {
  mapOrderToTripFinancialSnapshot,
  type ProductionOrderReadInput,
  type ProductionFinanceShadowDto,
} from "@/adapters/finance/ProductionFinanceReadAdapter";
import { FinanceReadService } from "@/application/finance/FinanceReadService";
import {
  buildAgentAccountingLine,
  buildDriverAccountingLine,
} from "@/domain/finance/v2/AccountingLine";
import type { TripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import type { FinanceFr1CandidateOrder } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import {
  assertProductionFinanceRejectsRegistryInput,
  FinanceFr1RegistryPilotDeniedError,
} from "@/application/finance/pilot/FinanceFr1RegistryPilotGate";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  type FinanceFr1SyntheticFixtureRegistryDoc,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";

export { FinanceFr1RegistryPilotDeniedError };
export {
  assertProductionFinanceRejectsRegistryInput,
  isRegistryFinanceInputSource,
} from "@/application/finance/pilot/FinanceFr1RegistryPilotGate";

export type FinanceCanonicalTripInputSource =
  | {
      kind: "order";
      documentId: string;
      data: Record<string, unknown>;
      currentCountryAgentId?: string | null;
    }
  | {
      kind: "registry_fixture";
      registryDoc: FinanceFr1SyntheticFixtureRegistryDoc;
      /** Optional override; defaults to registry orderId. */
      documentId?: string;
    };

export class FinanceFr1RegistryInputRejectedError extends Error {
  readonly code = "FINANCE_FR1_REGISTRY_INPUT_REJECTED";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr1RegistryInputRejectedError";
  }
}

/**
 * Map registry fixture document → ProductionOrderReadInput (order-shaped payload).
 * Requires FINANCE_FR1_REGISTRY_PILOT=1.
 */
export function mapRegistryFixtureToProductionOrderReadInput(
  registryDoc: FinanceFr1SyntheticFixtureRegistryDoc = FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  options?: {
    registryPilotFlag?: string | null;
    documentId?: string;
  },
): ProductionOrderReadInput {
  assertProductionFinanceRejectsRegistryInput({
    sourceCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    sourceKind: "registry_fixture",
    registryPilotFlag: options?.registryPilotFlag,
  });

  const orderId =
    options?.documentId?.trim() ||
    registryDoc.orderId ||
    FINANCE_FR1_SYNTHETIC_ORDER_ID;

  if (orderId !== registryDoc.orderId) {
    throw new FinanceFr1RegistryInputRejectedError(
      `registry orderId mismatch: expected ${registryDoc.orderId}, got ${orderId}`,
    );
  }

  if (registryDoc.settlementV2 !== false) {
    throw new FinanceFr1RegistryInputRejectedError(
      "registry fixture must declare settlementV2=false",
    );
  }

  return {
    documentId: orderId,
    data: registryDoc.orderPayload as unknown as Record<string, unknown>,
    sourceCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    sourceKind: "registry_fixture",
    registryPilotFlag: options?.registryPilotFlag,
  };
}

/**
 * Resolve ANY Finance trip input to the SAME ProductionOrderReadInput shape.
 * Registry path is gated; order path is the normal Production SoT.
 */
export function resolveCanonicalFinanceTripInput(
  source: FinanceCanonicalTripInputSource,
  options?: { registryPilotFlag?: string | null },
): ProductionOrderReadInput {
  if (source.kind === "order") {
    return {
      documentId: source.documentId,
      data: source.data,
      currentCountryAgentId: source.currentCountryAgentId,
      sourceCollection: "order",
      sourceKind: "order",
    };
  }

  return mapRegistryFixtureToProductionOrderReadInput(source.registryDoc, {
    registryPilotFlag: options?.registryPilotFlag,
    documentId: source.documentId,
  });
}

/**
 * Registry → candidate order for FR1 search/calc (same payload shape as order/).
 */
export function mapRegistryFixtureToFinanceFr1Candidate(
  registryDoc: FinanceFr1SyntheticFixtureRegistryDoc = FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  options?: { registryPilotFlag?: string | null },
): FinanceFr1CandidateOrder {
  const mapped = mapRegistryFixtureToProductionOrderReadInput(registryDoc, options);
  return {
    documentId: mapped.documentId,
    data: mapped.data,
  };
}

/**
 * ONE calculation path: registry → order-shaped input → mapOrderToTripFinancialSnapshot.
 */
export function mapRegistryFixtureToTripFinancialSnapshot(
  registryDoc: FinanceFr1SyntheticFixtureRegistryDoc = FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  options?: { registryPilotFlag?: string | null },
): TripFinancialSnapshot {
  const input = mapRegistryFixtureToProductionOrderReadInput(registryDoc, options);
  return mapOrderToTripFinancialSnapshot(input);
}

/**
 * Prove registry and direct order payload feed identical TripFinancialSnapshot
 * via the same mapper (one calculation path).
 */
export function assertRegistryAndOrderShareCanonicalFinancePath(
  registryDoc: FinanceFr1SyntheticFixtureRegistryDoc = FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  options?: { registryPilotFlag?: string | null },
): {
  fromRegistry: TripFinancialSnapshot;
  fromOrderPayload: TripFinancialSnapshot;
  equalMajors: true;
} {
  const fromRegistry = mapRegistryFixtureToTripFinancialSnapshot(
    registryDoc,
    options,
  );
  const fromOrderPayload = mapOrderToTripFinancialSnapshot({
    documentId: registryDoc.orderId,
    data: registryDoc.orderPayload as unknown as Record<string, unknown>,
    sourceCollection: "order",
    sourceKind: "order",
  });

  const a = fromRegistry.majors;
  const b = fromOrderPayload.majors;
  if (a.orderId !== b.orderId) throw new Error("orderId diverge");
  if (a.currency !== b.currency) throw new Error("currency diverge");
  if (a.grossFare.amountMinor !== b.grossFare.amountMinor) {
    throw new Error("gross diverge");
  }
  if (a.customerTotal.amountMinor !== b.customerTotal.amountMinor) {
    throw new Error("customer diverge");
  }
  if (a.platformCommission.amountMinor !== b.platformCommission.amountMinor) {
    throw new Error("commission diverge");
  }
  if (a.vatAmount.amountMinor !== b.vatAmount.amountMinor) {
    throw new Error("vat diverge");
  }
  if (a.driverNet.amountMinor !== b.driverNet.amountMinor) {
    throw new Error("driverNet diverge");
  }
  if (a.lifecycleCompleted !== b.lifecycleCompleted) {
    throw new Error("lifecycle diverge");
  }

  return { fromRegistry, fromOrderPayload, equalMajors: true };
}

/**
 * Production Finance service entry: reject registry-backed shadow DTO builds
 * unless pilot flag set. Used to prove normal Production cannot consume registry.
 */
export function buildProductionFinanceShadowFromCanonicalInput(
  source: FinanceCanonicalTripInputSource,
  options?: { registryPilotFlag?: string | null },
): ProductionFinanceShadowDto {
  const readInput = resolveCanonicalFinanceTripInput(source, options);
  // Re-assert at Production boundary (defense in depth).
  assertProductionFinanceRejectsRegistryInput({
    sourceCollection: readInput.sourceCollection,
    sourceKind: readInput.sourceKind,
    registryPilotFlag: options?.registryPilotFlag,
  });

  const snapshot = mapOrderToTripFinancialSnapshot(readInput);
  const driverId = snapshot.driverId ?? "unknown_driver";
  const driverLine = buildDriverAccountingLine(snapshot, driverId);
  const agentLine = buildAgentAccountingLine(snapshot);
  const financeRead = new FinanceReadService();
  return {
    trip: financeRead.toTripDto(snapshot),
    driverLine: financeRead.toLineDto(driverLine),
    agentLine: financeRead.toLineDto(agentLine),
    snapshot,
    productionWrites: 0,
  };
}

/**
 * Leaf gate for FR1 registry-backed Finance input.
 * No adapter imports — safe for ProductionFinanceReadAdapter.
 */

import {
  FINANCE_FR1_REGISTRY_PILOT_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { isFinanceFr1RegistryPilotEnabled } from "@/application/finance/pilot/isFinanceFr1RegistryPilotEnabled";

export class FinanceFr1RegistryPilotDeniedError extends Error {
  readonly code = "FINANCE_FR1_REGISTRY_PILOT_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr1RegistryPilotDeniedError";
  }
}

/**
 * Normal Production Finance path: reject registry collection / sourceKind unless
 * FINANCE_FR1_REGISTRY_PILOT=1.
 */
export function assertProductionFinanceRejectsRegistryInput(input: {
  sourceCollection?: string | null;
  sourceKind?: string | null;
  registryPilotFlag?: string | null;
}): void {
  const collection = (input.sourceCollection ?? "").trim();
  const kind = (input.sourceKind ?? "").trim();
  const isRegistry =
    collection === FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION ||
    kind === "registry_fixture" ||
    kind === "admin_next_finance_fr1_order_fixtures";

  if (!isRegistry) return;

  if (!isFinanceFr1RegistryPilotEnabled(input.registryPilotFlag)) {
    throw new FinanceFr1RegistryPilotDeniedError(
      `Registry Finance input forbidden without ${FINANCE_FR1_REGISTRY_PILOT_ENV}=1 ` +
        `(collection=${collection || "n/a"}, kind=${kind || "n/a"})`,
    );
  }
}

export function isRegistryFinanceInputSource(input: {
  sourceCollection?: string | null;
  sourceKind?: string | null;
}): boolean {
  const collection = (input.sourceCollection ?? "").trim();
  const kind = (input.sourceKind ?? "").trim();
  return (
    collection === FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION ||
    kind === "registry_fixture" ||
    kind === "admin_next_finance_fr1_order_fixtures"
  );
}

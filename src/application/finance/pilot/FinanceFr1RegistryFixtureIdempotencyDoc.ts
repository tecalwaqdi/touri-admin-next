/**
 * Idempotency document for FR1 registry fixture create-only provisioning.
 */

import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_OP,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export type FinanceFr1RegistryFixtureIdempotencyDoc = {
  readonly key: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY;
  readonly op: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_OP;
  readonly schemaVersion: "finance_fr1_synthetic_order_fixture_v1";
  readonly synthetic: true;
  readonly financePilot: true;
  readonly registryCollection: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION;
  readonly registryDocId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID;
  readonly orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  readonly status: "CREATED";
  readonly orderMaterialization: "forbidden";
  readonly settlementV2: false;
  readonly financeAccountingSnapshots: false;
  readonly createdAtUtc: string;
};

export function buildFinanceFr1RegistryFixtureIdempotencyDoc(
  createdAtUtc: string,
): FinanceFr1RegistryFixtureIdempotencyDoc {
  return {
    key: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    op: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_OP,
    schemaVersion: "finance_fr1_synthetic_order_fixture_v1",
    synthetic: true,
    financePilot: true,
    registryCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    registryDocId: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
    orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    status: "CREATED",
    orderMaterialization: "forbidden",
    settlementV2: false,
    financeAccountingSnapshots: false,
    createdAtUtc,
  };
}

export function isConsistentFinanceFr1RegistryFixtureIdempotencyDoc(
  data: Record<string, unknown> | null | undefined,
): boolean {
  if (!data) return false;
  return (
    data.key === FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY &&
    data.op === FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_OP &&
    data.schemaVersion === "finance_fr1_synthetic_order_fixture_v1" &&
    data.synthetic === true &&
    data.financePilot === true &&
    data.registryCollection ===
      FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION &&
    data.registryDocId === FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID &&
    data.orderId === FINANCE_FR1_SYNTHETIC_ORDER_ID &&
    data.status === "CREATED" &&
    data.settlementV2 === false &&
    data.financeAccountingSnapshots === false
  );
}

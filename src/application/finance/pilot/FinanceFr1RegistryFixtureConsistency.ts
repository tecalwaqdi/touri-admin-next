/**
 * Consistency checks for FR1 registry fixture + idempotency pair.
 * Never auto-repair partial/conflict state.
 */

import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  type FinanceFr1SyntheticFixtureRegistryDoc,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { isConsistentFinanceFr1RegistryFixtureIdempotencyDoc } from "@/application/finance/pilot/FinanceFr1RegistryFixtureIdempotencyDoc";

export type FinanceFr1RegistryFixtureExistenceState =
  | { kind: "absent" }
  | { kind: "consistent_both_exist" }
  | {
      kind: "conflict";
      reason:
        | "registry_only"
        | "idempotency_only"
        | "registry_payload_mismatch"
        | "idempotency_payload_mismatch";
    };

export function isConsistentFinanceFr1RegistryFixtureDoc(
  data: Record<string, unknown> | null | undefined,
  expected: FinanceFr1SyntheticFixtureRegistryDoc = FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
): boolean {
  if (!data) return false;
  if (data.schemaVersion !== expected.schemaVersion) return false;
  if (data.synthetic !== true || data.financePilot !== true) return false;
  if (data.orderId !== expected.orderId) return false;
  if (data.settlementV2 !== false) return false;
  if (data.orderMaterialization !== expected.orderMaterialization) return false;
  if (data.targetCollectionIfMaterialized !== "order") return false;
  const payload = data.orderPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  const e = expected.orderPayload;
  return (
    p.synthetic === true &&
    p.financePilot === true &&
    p.is_test === true &&
    p.admin_next_finance_fixture === true &&
    p.status_code === e.status_code &&
    p.currency === e.currency &&
    p.country_id === e.country_id &&
    p.total_mndob2 === e.total_mndob2 &&
    p.total === e.total &&
    p.total_app === e.total_app &&
    p.total_vat === e.total_vat &&
    p.total_mndob === e.total_mndob &&
    p.PaymentMethod === e.PaymentMethod &&
    p.payment_method === e.payment_method &&
    p.payment_status === e.payment_status &&
    p.driver_id === e.driver_id
  );
}

export function assessFinanceFr1RegistryFixtureExistence(input: {
  registryData: Record<string, unknown> | null;
  idempotencyData: Record<string, unknown> | null;
}): FinanceFr1RegistryFixtureExistenceState {
  const registryExists = input.registryData != null;
  const idemExists = input.idempotencyData != null;

  if (!registryExists && !idemExists) return { kind: "absent" };

  if (registryExists && !idemExists) {
    return { kind: "conflict", reason: "registry_only" };
  }
  if (!registryExists && idemExists) {
    return { kind: "conflict", reason: "idempotency_only" };
  }

  if (!isConsistentFinanceFr1RegistryFixtureDoc(input.registryData)) {
    return { kind: "conflict", reason: "registry_payload_mismatch" };
  }
  if (!isConsistentFinanceFr1RegistryFixtureIdempotencyDoc(input.idempotencyData)) {
    return { kind: "conflict", reason: "idempotency_payload_mismatch" };
  }

  return { kind: "consistent_both_exist" };
}

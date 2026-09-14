/**
 * FR6 adjustment pilot — IAM derivation for operator ADC.
 * Adjustment CREATE + audit + idempotency. No settlement/payment/snapshot mutation.
 */

import {
  FINANCE_FR6_ADJUSTMENT_COLLECTION,
  FINANCE_FR6_AUDIT_COLLECTION,
  FINANCE_FR6_IDEMPOTENCY_COLLECTION,
  FINANCE_FR6_SETTLEMENT_COLLECTION,
  FINANCE_FR6_SOURCE_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";

export const FINANCE_FR6_IAM_OPERATION_PROOF = [
  {
    surface: "fr5_settlement_and_precondition_reads",
    adapter: `${FINANCE_FR6_SETTLEMENT_COLLECTION}.get + snapshot/payment existence`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr1_snapshot_integrity_read",
    adapter: `${FINANCE_FR6_SOURCE_SNAPSHOT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "adjustment_create",
    adapter: `${FINANCE_FR6_ADJUSTMENT_COLLECTION}/{id}.create (approved append-only)`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_intent_and_result_create",
    adapter: `${FINANCE_FR6_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_create",
    adapter: `${FINANCE_FR6_IDEMPOTENCY_COLLECTION}/{key}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_actor_meta_read",
    adapter: "auth.getUser (RBAC verify only)",
    permission: "firebaseauth.users.get",
    requiredOnOperatorAdc: true,
  },
] as const;

export const FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.create",
  "firebaseauth.users.get",
] as const;

export type FinanceFr6RequiredOperatorIamPermission =
  (typeof FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR6_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

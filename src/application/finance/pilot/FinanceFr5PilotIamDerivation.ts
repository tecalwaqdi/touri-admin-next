/**
 * FR5 Settlement Execution / Collection pilot — IAM derivation for operator ADC.
 * Payment CREATE + settlement UPDATE + audit + idempotency.
 * No order / snapshot / wallet / payout / Auth mutation.
 */

import {
  FINANCE_FR5_AUDIT_COLLECTION,
  FINANCE_FR5_IDEMPOTENCY_COLLECTION,
  FINANCE_FR5_PAYMENT_COLLECTION,
  FINANCE_FR5_SETTLEMENT_COLLECTION,
  FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";

export const FINANCE_FR5_IAM_OPERATION_PROOF = [
  {
    surface: "fr4_settlement_and_precondition_reads",
    adapter: `${FINANCE_FR5_SETTLEMENT_COLLECTION}.get + snapshot/idempotency existence`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr1_snapshot_integrity_read",
    adapter: `${FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "settlement_payment_create",
    adapter: `${FINANCE_FR5_PAYMENT_COLLECTION}/{id}.create (confirmed collection record)`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "settlement_v2_payment_state_update",
    adapter: `${FINANCE_FR5_SETTLEMENT_COLLECTION}/{id}.update (paid/status/outstanding)`,
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_intent_and_result_create",
    adapter: `${FINANCE_FR5_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_create",
    adapter: `${FINANCE_FR5_IDEMPOTENCY_COLLECTION}/{key}.create`,
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

export const FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.create",
  "datastore.entities.update",
  "firebaseauth.users.get",
] as const;

export type FinanceFr5RequiredOperatorIamPermission =
  (typeof FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR5_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

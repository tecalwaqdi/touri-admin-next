/**
 * Finance FR1 pilot — IAM derivation for operator ADC.
 * Snapshot + audit + idempotency only. No Driver/Agent/Customer/Auth writes.
 */

import {
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";

export const FINANCE_FR1_IAM_OPERATION_PROOF = [
  {
    surface: "candidate_and_precondition_reads",
    adapter: "order.get + snapshot/idempotency existence checks",
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "candidate_query_completed_orders",
    adapter: "order.where(status_code==completed).limit",
    permission: "datastore.entities.list",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "accounting_snapshot_create_only",
    adapter: `${FINANCE_FR1_SNAPSHOT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_intent_and_result_create",
    adapter: `${FINANCE_FR1_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_create_or_merge",
    adapter: `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/{key}.create|set(merge)`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_already_applied_patch",
    adapter: `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/{key}.set(merge)`,
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_actor_meta_read",
    adapter: "auth.getUser (RBAC verify only)",
    permission: "firebaseauth.users.get",
    requiredOnOperatorAdc: true,
  },
] as const;

export const FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.list",
  "datastore.entities.create",
  "datastore.entities.update",
  "firebaseauth.users.get",
] as const;

export type FinanceFr1RequiredOperatorIamPermission =
  (typeof FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR1_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

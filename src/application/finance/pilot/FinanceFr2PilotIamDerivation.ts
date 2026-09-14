/**
 * FR2 Settlement V2 pilot — IAM derivation for operator ADC.
 * Settlement draft + audit + idempotency only.
 * No order / snapshot mutation / payment / payout / Auth / domain writes.
 */

import {
  FINANCE_FR2_AUDIT_COLLECTION,
  FINANCE_FR2_IDEMPOTENCY_COLLECTION,
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";

export const FINANCE_FR2_IAM_OPERATION_PROOF = [
  {
    surface: "fr1_snapshot_and_precondition_reads",
    adapter: `${FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION}.get + settlement/idempotency existence`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "settlement_v2_draft_create_only",
    adapter: `${FINANCE_FR2_SETTLEMENT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_intent_and_result_create",
    adapter: `${FINANCE_FR2_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_create",
    adapter: `${FINANCE_FR2_IDEMPOTENCY_COLLECTION}/{key}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_already_applied_patch",
    adapter: `${FINANCE_FR2_IDEMPOTENCY_COLLECTION}/{key}.set(merge)`,
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

export const FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.create",
  "datastore.entities.update",
  "firebaseauth.users.get",
] as const;

export type FinanceFr2RequiredOperatorIamPermission =
  (typeof FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR2_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

/**
 * FR4 Settlement Approval pilot — IAM derivation for operator ADC.
 * Settlement UPDATE (approval/lock) + audit + idempotency only.
 * No order / snapshot mutation / payment / payout / Auth / domain writes.
 */

import {
  FINANCE_FR4_AUDIT_COLLECTION,
  FINANCE_FR4_IDEMPOTENCY_COLLECTION,
  FINANCE_FR4_SETTLEMENT_COLLECTION,
  FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";

export const FINANCE_FR4_IAM_OPERATION_PROOF = [
  {
    surface: "fr2_settlement_and_precondition_reads",
    adapter: `${FINANCE_FR4_SETTLEMENT_COLLECTION}.get + snapshot/idempotency existence`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr1_snapshot_integrity_read",
    adapter: `${FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "settlement_v2_approval_update_only",
    adapter: `${FINANCE_FR4_SETTLEMENT_COLLECTION}/{id}.update (status/lock/approval fields)`,
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_intent_and_result_create",
    adapter: `${FINANCE_FR4_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_create",
    adapter: `${FINANCE_FR4_IDEMPOTENCY_COLLECTION}/{key}.create`,
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

export const FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.create",
  "datastore.entities.update",
  "firebaseauth.users.get",
] as const;

export type FinanceFr4RequiredOperatorIamPermission =
  (typeof FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR4_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

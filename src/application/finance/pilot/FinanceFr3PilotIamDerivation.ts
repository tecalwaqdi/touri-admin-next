/**
 * FR3 Reconciliation pilot — IAM derivation.
 * Read-only shadow recon: no create/update required.
 * Optional live verify needs get (+ auth actor meta) only.
 */

import {
  FINANCE_FR3_SETTLEMENT_COLLECTION,
  FINANCE_FR3_SNAPSHOT_COLLECTION,
  FINANCE_FR3_IDEMPOTENCY_COLLECTION,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";

export const FINANCE_FR3_IAM_OPERATION_PROOF = [
  {
    surface: "fr1_snapshot_read",
    adapter: `${FINANCE_FR3_SNAPSHOT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr2_settlement_read",
    adapter: `${FINANCE_FR3_SETTLEMENT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_integrity_reads",
    adapter: `${FINANCE_FR3_IDEMPOTENCY_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_actor_meta_read",
    adapter: "auth.getUser (RBAC verify only)",
    permission: "firebaseauth.users.get",
    requiredOnOperatorAdc: true,
  },
] as const;

/** Write IAM: none — FR3 is read-only by design. */
export const FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES =
  [] as const;

/** Live read-verify IAM (optional; no Production writes). */
export const FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "firebaseauth.users.get",
] as const;

export type FinanceFr3RequiredOperatorIamPermission =
  (typeof FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR3_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.create",
  "datastore.entities.update",
  "datastore.entities.delete",
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

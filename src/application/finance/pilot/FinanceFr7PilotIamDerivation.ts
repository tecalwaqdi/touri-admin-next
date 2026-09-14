/**
 * FR7 Reporting pilot — IAM derivation.
 * Read-only: get on canonical Finance docs + auth actor meta.
 */

import {
  FINANCE_FR7_ADJUSTMENT_COLLECTION,
  FINANCE_FR7_PAYMENT_COLLECTION,
  FINANCE_FR7_SETTLEMENT_COLLECTION,
  FINANCE_FR7_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";

export const FINANCE_FR7_IAM_OPERATION_PROOF = [
  {
    surface: "fr1_snapshot_read",
    adapter: `${FINANCE_FR7_SNAPSHOT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr2_settlement_read",
    adapter: `${FINANCE_FR7_SETTLEMENT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr5_payment_read",
    adapter: `${FINANCE_FR7_PAYMENT_COLLECTION}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "fr6_adjustment_read",
    adapter: `${FINANCE_FR7_ADJUSTMENT_COLLECTION}.get`,
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

export const FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES =
  [] as const;

export const FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "firebaseauth.users.get",
] as const;

export type FinanceFr7RequiredOperatorIamPermission =
  (typeof FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

export const FINANCE_FR7_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.create",
  "datastore.entities.update",
  "datastore.entities.delete",
  "firebaseauth.users.update",
  "firebaseauth.users.create",
  "firebaseauth.users.delete",
] as const;

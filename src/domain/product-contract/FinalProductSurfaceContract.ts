/**
 * Daily-ops product contract classifications for FINAL 100% readiness.
 * Required surfaces must be COMPLETE | NOT_APPLICABLE_* | SECURITY_BLOCKED.
 * SECURITY_BLOCKED ⇒ readiness cannot be 100.
 */

export type ProductSurfaceClassification =
  | "COMPLETE"
  | "NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT"
  | "NOT_APPLICABLE_TO_ADMIN"
  | "SECURITY_BLOCKED"
  | "READY_EXISTING_GATED_OFF";

export const FINAL_PRODUCT_SURFACE_CONTRACT = {
  usersRead: "COMPLETE",
  usersWrite: "READY_EXISTING_GATED_OFF",
  rolesWrite: "READY_EXISTING_GATED_OFF",
  identityClaimsSecurity: "COMPLETE",
  driverDocuments: "COMPLETE",
  driverVehicle: "COMPLETE",
  support: "COMPLETE",
  settings: "NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT",
  notifications: "COMPLETE",
  customerAuthDeletion: "NOT_APPLICABLE_TO_ADMIN",
  geographyWrites: "READY_EXISTING_GATED_OFF",
  settlementCreate: "READY_EXISTING_GATED_OFF",
  financeControlledActions: "READY_EXISTING_GATED_OFF",
} as const satisfies Record<string, ProductSurfaceClassification>;

export const SETTINGS_PRODUCT_POLICY = {
  classification: "NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT" as const,
  reason:
    "No safe business-config settings surface is defined for Admin Next. Env/IAM/Firebase secrets must never be exposed as Settings.",
  routePresent: false,
  navPresent: false,
};

export const CUSTOMER_DELETION_ADMIN_POLICY = {
  classification: "NOT_APPLICABLE_TO_ADMIN" as const,
  reason:
    "Compliant account deletion is user/website + Cloud Functions (requestAccountDeletion / createAccountDeletionRequest). Admin must not destroy financial history; Admin Next offers disable/block/reactivate only.",
  adminDeletionEndpoint: false,
};

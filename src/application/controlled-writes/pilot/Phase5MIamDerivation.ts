/**
 * Phase 5M — DERIVE exact operator ADC IAM from Production adapter operations.
 * Proof from Phase5MProductionWriteAdapters + executeDriverControlledWrite order.
 * Do NOT assume datastore update/create/get alone without mapping each surface.
 *
 * Auth claim write is owned by Cloud Function syncUserClaimsOnWrite — operator
 * ADC must NOT require firebaseauth.users.update.
 *
 * SDK boundary (mandatory):
 * - Firebase Admin / Google server SDK → Google Cloud IAM
 * - Firebase client SDK → Firestore Security Rules (NOT used on this path)
 *
 * testIamPermissions is a CRM policy check only — it does NOT prove a live
 * Firestore DocumentReference.create/update RPC will succeed for the same
 * ADC principal. Stage-classified PERMISSION_DENIED on adapters is authoritative.
 */

export const PHASE_5M_AUDIT_COLLECTION = "admin_next_cw_audit" as const;
export const PHASE_5M_IDEMPOTENCY_COLLECTION =
  "admin_next_cw_idempotency" as const;
export const PHASE_5M_DRIVER_COLLECTION = "user" as const;

/**
 * Adapter operation → IAM permission mapping (Admin SDK / Datastore IAM).
 *
 * | Surface | Adapter op | IAM |
 * |---|---|---|
 * | Load driver + txn re-read | doc.get / transaction.get | datastore.entities.get |
 * | Domain patch registration_status | transaction.update (existing) | datastore.entities.update |
 * | Audit INTENT create | collection.doc(id).create | datastore.entities.create |
 * | Audit RESULT create | collection.doc(id).create | datastore.entities.create |
 * | Idempotency get | doc.get | datastore.entities.get |
 * | Idempotency first put | doc.create | datastore.entities.create |
 * | Idempotency second put (auditResultId) | doc.update / set merge | datastore.entities.update |
 * | Post-write Auth claim verify | auth.getUser | firebaseauth.users.get |
 * | syncUserClaimsOnWrite setCustomUserClaims | Cloud Function SA (NOT operator ADC) | (CF-owned) |
 */
export const PHASE_5M_IAM_OPERATION_PROOF = [
  {
    surface: "driver_user_doc_load_and_txn_reread",
    adapter: "Phase5MFirestoreDriverPort.getUserDoc / runTransaction.get",
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "driver_user_doc_allowlisted_update",
    adapter: "Phase5MControlledDriverWriteRepository.apply → transaction.update",
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
    notes:
      "Update-only on existing user/{uid}; create would be wrong (fixture already exists).",
  },
  {
    surface: "audit_intent_create",
    adapter: `Phase5MAuditPort.recordIntent → ${PHASE_5M_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "audit_result_create",
    adapter: `Phase5MAuditPort.recordResult → ${PHASE_5M_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_get",
    adapter: `Phase5MIdempotencyStore.get → ${PHASE_5M_IDEMPOTENCY_COLLECTION}/{key}.get`,
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_first_put",
    adapter: `Phase5MIdempotencyStore.put → ${PHASE_5M_IDEMPOTENCY_COLLECTION}/{key}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_second_put_audit_result_id",
    adapter: `Phase5MIdempotencyStore.put → ${PHASE_5M_IDEMPOTENCY_COLLECTION}/{key}.set(merge)`,
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_claim_bounded_verify",
    adapter: "auth.getUser (read-only verify after CF)",
    permission: "firebaseauth.users.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_claim_setCustomUserClaims",
    adapter: "Production CF syncUserClaimsOnWrite (NOT operator ADC)",
    permission: "firebaseauth.users.update",
    requiredOnOperatorAdc: false,
    notes:
      "operatorAuthWritePermissionRequired=false — CF runtime SA owns Auth write.",
  },
] as const;

/** Exact unique permissions required on the operator ADC identity. */
export const PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.update",
  "datastore.entities.create",
  "firebaseauth.users.get",
] as const;

export type Phase5MRequiredOperatorIamPermission =
  (typeof PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

/**
 * Auth trigger ownership — operator ADC must not request users.update.
 */
export const PHASE_5M_AUTH_TRIGGER_OWNERSHIP = {
  expectedAuthTrigger: true as const,
  authClaimWrites: 1 as const,
  operatorAuthWritePermissionRequired: false as const,
  operatorAuthWritePermission: "firebaseauth.users.update" as const,
  claimWriter: "syncUserClaimsOnWrite" as const,
  claimWriterRuntime: "cloud_function_service_account" as const,
  justification:
    "user/{uid} update fires syncUserClaimsOnWrite which always calls " +
    "setCustomUserClaims; operator ADC only needs firebaseauth.users.get for " +
    "bounded post-write claim verify. Prefer operatorAuthWritePermissionRequired=false.",
} as const;

/** Reads remain on existing viewer roles (not part of write grant plan). */
export const PHASE_5M_READ_IAM_BASELINE = {
  keep: ["roles/datastore.viewer", "roles/firebaseauth.viewer"] as const,
  notes:
    "Do not broaden to editor / datastore.user / firebaseauth.admin for Pilot.",
} as const;

export function derivePhase5MRequiredOperatorIamPermissions(): readonly Phase5MRequiredOperatorIamPermission[] {
  return [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS];
}

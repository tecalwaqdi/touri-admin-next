/**
 * Phase 5N — DERIVE exact operator ADC IAM from metadata-only reconcile ops.
 * No Driver domain update. No Auth claim write. No INTENT rewrite.
 */

import {
  PHASE_5N_AUDIT_COLLECTION,
  PHASE_5N_IDEMPOTENCY_COLLECTION,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

/**
 * Adapter operation → IAM permission mapping (Admin SDK / Datastore IAM).
 *
 * | Surface | Adapter op | IAM |
 * |---|---|---|
 * | Precondition / post-verify reads | doc.get (user, audit, idempotency) | datastore.entities.get |
 * | Success AUDIT_RESULT create-only | admin_next_cw_audit/{id}.create | datastore.entities.create |
 * | Idempotency result.auditResultId patch | set(merge) on existing doc | datastore.entities.update |
 * | Auth meta read (verify only) | auth.getUser | firebaseauth.users.get |
 */
export const PHASE_5N_IAM_OPERATION_PROOF = [
  {
    surface: "precondition_and_post_verify_gets",
    adapter: "Phase5NMetadataReadPort.loadObservedMetadata → doc.get",
    permission: "datastore.entities.get",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "success_audit_result_create_only",
    adapter: `Phase5NMetadataWritePort.createSuccessAuditResult → ${PHASE_5N_AUDIT_COLLECTION}/{id}.create`,
    permission: "datastore.entities.create",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "idempotency_audit_result_id_patch",
    adapter: `Phase5NMetadataWritePort.patchIdempotencyAuditResultId → ${PHASE_5N_IDEMPOTENCY_COLLECTION}/{key}.set(merge)`,
    permission: "datastore.entities.update",
    requiredOnOperatorAdc: true,
  },
  {
    surface: "auth_meta_read_only",
    adapter: "auth.getUser (read-only observed metadata)",
    permission: "firebaseauth.users.get",
    requiredOnOperatorAdc: true,
  },
] as const;

/** Exact unique permissions required on the operator ADC identity for Phase 5N. */
export const PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS = [
  "datastore.entities.get",
  "datastore.entities.create",
  "datastore.entities.update",
  "firebaseauth.users.get",
] as const;

export type Phase5NRequiredOperatorIamPermission =
  (typeof PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS)[number];

/** Explicitly NOT required — domain / Auth claim / Phase 5M path. */
export const PHASE_5N_FORBIDDEN_OPERATOR_IAM_PERMISSIONS = [
  "firebaseauth.users.update",
  "firebaseauth.users.create",
] as const;

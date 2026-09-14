/**
 * Phase 5M — temporary least-privilege custom role PLAN only.
 * Do NOT create role. Do NOT grant. Document exact missing perms after preflight.
 */

import {
  PHASE_5M_READ_IAM_BASELINE,
  PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  type Phase5MRequiredOperatorIamPermission,
} from "@/application/controlled-writes/pilot/Phase5MIamDerivation";

export const PHASE_5M_TEMP_CUSTOM_ROLE_ID_PLAN =
  "touriPhase5mDriverPilotWrite" as const;

export const PHASE_5M_TEMP_CUSTOM_ROLE_TITLE_PLAN =
  "Touri Phase 5M Driver Pilot Write (temporary)" as const;

/** Prefer NOT granting these broad roles for Pilot. */
export const PHASE_5M_BROAD_ROLES_AVOID = [
  "roles/editor",
  "roles/datastore.user",
  "roles/firebaseauth.admin",
] as const;

export type Phase5MTempCustomRolePlan = {
  readonly mode: "plan_only";
  readonly createRole: false;
  readonly grantRole: false;
  readonly roleId: typeof PHASE_5M_TEMP_CUSTOM_ROLE_ID_PLAN;
  readonly title: typeof PHASE_5M_TEMP_CUSTOM_ROLE_TITLE_PLAN;
  /** Exact permissions to include — typically the missing subset only. */
  readonly includedPermissions: readonly Phase5MRequiredOperatorIamPermission[];
  readonly keepReadBaseline: typeof PHASE_5M_READ_IAM_BASELINE.keep;
  readonly avoidBroadRoles: typeof PHASE_5M_BROAD_ROLES_AVOID;
  readonly operatorAuthWritePermissionRequired: false;
  readonly notes: string;
};

/**
 * Build a temporary custom role plan from preflight missing permissions.
 * If missing is empty, plan still documents full required set as reference
 * (no create/grant).
 */
export function planPhase5MTemporaryCustomRole(input: {
  missingPermissions: readonly string[];
}): Phase5MTempCustomRolePlan {
  const missing = PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter((p) =>
    input.missingPermissions.includes(p),
  );
  const included =
    missing.length > 0
      ? missing
      : [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS];

  return {
    mode: "plan_only",
    createRole: false,
    grantRole: false,
    roleId: PHASE_5M_TEMP_CUSTOM_ROLE_ID_PLAN,
    title: PHASE_5M_TEMP_CUSTOM_ROLE_TITLE_PLAN,
    includedPermissions: included,
    keepReadBaseline: PHASE_5M_READ_IAM_BASELINE.keep,
    avoidBroadRoles: PHASE_5M_BROAD_ROLES_AVOID,
    operatorAuthWritePermissionRequired: false,
    notes:
      missing.length > 0
        ? `Grant ONLY missing permissions (${missing.join(",")}) temporarily to ADC identity. Do not add firebaseauth.users.update.`
        : "All derived operator permissions already granted — no temporary write role required.",
  };
}

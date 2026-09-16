/**
 * Identity-admin WIF IAM contract — application-code complete.
 * External Google IAM binding is an operator step (not granted in P1).
 * Shadow-reader SA remains read-only. No SA JSON. No ADC write runtime.
 */

export const IDENTITY_ADMIN_IAM_CONTRACT = {
  phase: "P1",
  appCodeComplete: true,
  iamGrantedThisPhase: false,
  shadowReaderRemainsReadOnly: true,
  saJsonForbidden: true,
  adcWriteRuntimeForbidden: true,
  claimsPath: "persona_firestore → syncUserClaimsOnWrite CF",
  gate: "ADMIN_IDENTITY_WRITE_ENABLED",
  gateDefault: false,
  hardLock: "IDENTITY_WRITE_PRODUCTION_HARD_FALSE",
  envPrincipal: "GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL",
  shadowReaderEnv: "GCP_SERVICE_ACCOUNT_EMAIL",
  requiredLeastPrivilege: [
    {
      resource: "firestore.googleapis.com",
      permission: "datastore.entities.update",
      scope: "user/{uid} allowlisted persona fields only",
    },
    {
      resource: "iam.googleapis.com",
      permission: "iam.serviceAccounts.getAccessToken",
      scope: "WIF / Vercel OIDC pool binding only",
    },
  ],
  forbiddenRoles: [
    "roles/owner",
    "roles/editor",
    "roles/firebase.admin",
    "roles/iam.serviceAccountUser on unrelated SAs",
  ],
  operatorSteps: [
    "Create SA touri-admin-next-identity-admin@PROJECT.iam.gserviceaccount.com",
    "Bind WIF provider (same pool pattern as shadow-reader) with attribute condition restricting to Production Vercel project",
    "Grant least-privilege Firestore update on user/{uid} allowlisted fields",
    "Set GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL in Vercel Production secrets",
    "Prove shadow-reader cannot write (negative IAM test)",
    "Do NOT grant Auth Admin to identity-admin (CF owns setCustomUserClaims)",
    "Arm ADMIN_IDENTITY_WRITE_ENABLED only after operator approval",
  ],
  antiEscalation: [
    "no self escalation",
    "no arbitrary custom claims from Admin Next",
    "invalid roles rejected",
    "country_admin cannot create global/super_admin",
    "agent_user cannot escalate",
    "last super_admin protection",
  ],
} as const;

export function identityAdminIamExternalStepPending(): boolean {
  return IDENTITY_ADMIN_IAM_CONTRACT.iamGrantedThisPhase === false;
}

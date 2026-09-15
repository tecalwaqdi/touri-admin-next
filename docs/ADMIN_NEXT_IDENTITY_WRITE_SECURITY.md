/**
 * Admin Next identity write security design.
 *
 * Goal: mutate Admin panel persona role/scope without SA JSON and without
 * granting shadow-reader Firebase Auth Admin / broad write rights.
 *
 * Canonical path (implemented, Production gated OFF):
 * 1. Browser → authenticated API (`/api/users/[id]/[action]`)
 * 2. resolveApiActor (verified Firebase ID token)
 * 3. requirePermission(`users:manage`)
 * 4. Anti-self-escalation + role rank + last-super_admin protection
 * 5. Scope checks (country_admin cannot escalate / out-of-scope)
 * 6. Feature gates: GLOBAL ∧ PRODUCTION_WRITE ∧ ADMIN_IDENTITY_WRITE
 * 7. Idempotency + audit INTENT
 * 8. Allowlisted Firestore `user/{uid}` persona field patch ONLY
 * 9. Production CF `syncUserClaimsOnWrite` owns Auth `setCustomUserClaims`
 * 10. Reconciliation states: CONSISTENT | CLAIMS_MISSING | PERSONA_MISSING |
 *     ROLE_MISMATCH | SCOPE_MISMATCH | DISABLED_MISMATCH
 * 11. Audit RESULT
 *
 * Dedicated write identity (required before Production arming):
 * - Create SA e.g. `touri-admin-next-identity-admin@…`
 * - Bind via WIF / Vercel OIDC (same pool pattern as shadow-reader)
 * - Env: `GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL` (separate from
 *   `GCP_SERVICE_ACCOUNT_EMAIL` shadow-reader)
 * - Least privilege: Firestore update on `user/{uid}` allowlisted fields only
 * - MUST NOT receive Project Editor/Owner
 * - MUST NOT be the shadow-reader SA
 * - Auth claims mutation remains CF runtime SA (existing Production CF)
 *
 * Gate default: `ADMIN_IDENTITY_WRITE_ENABLED=false`
 * UI chrome: `NEXT_PUBLIC_CONTROLLED_WRITES_UI` (never authorizes)
 *
 * Hard lock: `IDENTITY_WRITE_PRODUCTION_HARD_FALSE` remains false until operator
 * arming after IAM proof.
 *
 * No secrets in this document.
 */

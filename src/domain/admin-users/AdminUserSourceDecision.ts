/**
 * PC-4 — Production Admin Users source decision (inspect-first).
 *
 * Candidates inspected:
 * 1. Firebase Auth listUsers + custom claims
 *    - Auth-only Admin app refuses ADC (verifyIdToken only).
 *    - WIF transport is Firestore-native, not Auth Admin list.
 *    - listUsers would mix drivers/customers/admins; no approved Auth list path.
 *    - Decision: NOT USED (would reopen Auth credential surface / invent path).
 * 2. Dedicated admin_users collection — does not exist; not allowlisted.
 * 3. Legacy Firestore `user` with panel persona markers (IsAdmin / isAdminRule)
 *    — shared collection already RO-allowlisted; panel_claims derives Auth claims
 *    from these fields. Proven Legacy probe: IsAdmin==true limit 50.
 *
 * CANONICAL: Legacy Firestore `user` panel personas (bounded discriminator union).
 * LEGACY note: Agents (Isagent-only) remain on Agents surface; included here only
 * when they also carry a mappable Admin Next panel rule (e.g. isAdminRule=2).
 */

export const PRODUCTION_ADMIN_USER_SOURCE = {
  kind: "legacy_firestore_user_panel_persona" as const,
  collection: "user" as const,
  transport: "wif_native" as const,
  authListUsers: false,
  dedicatedAdminUsersCollection: false,
  /** Hard cap for merged unique directory sample. */
  maxItems: 50 as const,
};

export const ADMIN_USER_DISCRIMINATOR_QUERIES = [
  { field: "IsAdmin", value: true as const },
  { field: "isAdmin", value: true as const },
  { field: "isAdminRule", value: 1 as const },
  { field: "isAdminRule", value: 2 as const },
  { field: "isAdminRule", value: 5 as const },
  { field: "IsAdminRule", value: 1 as const },
  { field: "IsAdminRule", value: 2 as const },
  { field: "IsAdminRule", value: 5 as const },
] as const;

# PRODUCTION_AUTH_DESIGN

## Design ONLY — NO production Firebase Admin SDK connection in Phase 3.7

```
Browser
  → Firebase Auth (client sign-in)
  → ID Token
  → Admin Next Backend
    → ProductionIdentityVerifier.verify (future Admin SDK)
    → VerifiedIdentity
    → mapClaimsToIdentity (fail-closed)
    → RBAC permissionsForRole
    → assertScope / server-side scope filter
    → Repository
```

## Interfaces (implemented as TypeScript only)

- `ProductionIdentityVerifier` / `VerifiedIdentity`
- `FakeProductionIdentityVerifier` (tests ONLY)
- `FakeAgentCountryMembershipChecker`
- `mapClaimsToIdentity` / `resolveActorFromVerifiedToken`
- Files: `ProductionIdentityVerifier.ts`, `ProductionAuthDesign.ts`

## AUTH_MODE

| APP_ENV | Allowed |
|---|---|
| development | mock \| verified_token |
| staging / production | verified_token only |

Startup Guard rejects mock in staging/production.

## Fail-closed rules

| Condition | Result |
|---|---|
| Missing / invalid / expired token | deny |
| Wrong audience / issuer | deny |
| Disabled user | deny |
| Malformed claims | deny |
| Unknown claim/role | deny (≠ viewer) |
| partner / transport_manager | unsupported_legacy_role deny |
| Missing country scope for country_admin/agent | deny |
| Agent not in country (domain check) | deny |
| `x-user-id` / `x-role` / `x-country` / `x-agent` / mock bearer when APP_ENV≠development | deny |

## Super Admin decision

Legacy `panel_claims.js` sets `super_admin` from `isAdmin` OR `isAdminRule=1`.  
Admin Next grants global **only** when verified token claims include `super_admin=true`.  
Client-sent `isAdmin` / `x-role` never grants global.

## Claim mapping

See `LEGACY_CLAIMS_TO_ADMIN_NEXT_MAPPING.md` + `AUTH_READINESS_MATRIX.md`.

## Explicit non-goals (3.7)

- No `admin.auth().verifyIdToken` against production
- No service account credentials
- No enabling PRODUCTION_READ

## Tests

`src/test/unit/phase37-readiness.test.ts` + prior api-auth / phase35 suites.

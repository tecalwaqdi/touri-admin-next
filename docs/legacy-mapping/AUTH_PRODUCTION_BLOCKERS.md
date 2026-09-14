# AUTH_PRODUCTION_BLOCKERS

## x-user-id MUST NOT be accepted in staging/production authentication

Admin Next development APIs currently resolve the actor from:
- `x-user-id` header, or
- `Authorization: Bearer mock:{userId}`

**Policy:**
- Allowed only when `APP_ENV=development`
- **Forbidden** when `APP_ENV` is `staging` or `production`
- Production path fails closed until real Firebase Auth (ID token verification) is implemented

Evidence of enforcement:
- `src/infrastructure/http/apiAuth.ts` → `isHeaderUserIdAuthAllowed`
- Test: `src/test/unit/api-auth-production.test.ts`
- Phase 3.5 reaffirm: `src/test/unit/phase35-canonical-contract.test.ts`

## Phase 3.5 auth design (not connected)

See `PRODUCTION_AUTH_DESIGN.md` + Phase 3.7:
- `ProductionIdentityVerifier` / `FakeProductionIdentityVerifier`
- Fail-closed unknown claim / missing scope / expired token / wrong aud/iss
- Claim mapping: `LEGACY_CLAIMS_TO_ADMIN_NEXT_MAPPING.md`
- `AUTH_MODE=mock` forbidden in staging/production (startup guard)

## Other auth blockers before Production Read

| Blocker | Status |
|---|---|
| No Firebase Auth token verification wired to production Firebase | BLOCKER (Phase 4+) |
| No live claim sync with Legacy `panel_claims` | BLOCKER (Phase 4+) |
| Partner / transport_manager unmapped → deny | DOCUMENTED fail-closed |
| Mock password login UI | Dev only — must not ship as production auth |
| AUTH_MODE mock in staging/production | **FORBIDDEN** (startup guard + tests) |

## Status

**x-user-id / x-role / x-country / x-agent production blocker: DOCUMENTED + TEST-ENFORCED (reject).**  
**Production Auth Design: DOCUMENTED + Fake-tested; NOT CONNECTED.**  
**Phase 3.7:** AUTH_MODE guard + VerifiedIdentity contract complete for read-only design gate.

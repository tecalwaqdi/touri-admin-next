# AUTH_READINESS_MATRIX

| Scenario | Expected | Contract | Test | Production safe? |
|---|---|---|---|---|
| Missing token | DENY | `ProductionIdentityVerifier.verify` | phase37 | yes (fail-closed) |
| Invalid token | DENY | Fake + future Admin SDK | phase37 | yes |
| Expired token | DENY | `expiresAt` + skew | phase37 | yes |
| Wrong audience | DENY | `expectedAudience` | phase37 | yes |
| Wrong issuer | DENY | `expectedIssuer` | phase37 | yes |
| Disabled user | DENY | `VerifiedIdentity.disabled` | phase37 | yes |
| Malformed claims | DENY | claims object required | phase37 | yes |
| Unknown / empty claims | DENY (≠ viewer) | `mapClaimsToIdentity` | phase37 | yes |
| Missing country scope (country_admin) | DENY | role + countryId | phase37 | yes |
| Agent missing membership | DENY | agentId + countryId + domain check | phase37 | yes |
| partner / transport_manager | DENY unsupported_legacy_role | mapping table | phase37 | yes |
| `AUTH_MODE=mock` + staging/production | Startup fail | `assertAuthModeAllowed` | phase37 | yes |
| `x-user-id` / `x-role` / `x-country` / `x-agent` outside development | DENY | `apiAuth` | phase37 / api-auth-production | yes |
| Super Admin via verified `super_admin` claim | ALLOW global | claims mapping | phase37 | design-safe (no live Firebase yet) |

## AUTH_MODE

| APP_ENV | Allowed AUTH_MODE |
|---|---|
| development | `mock` or `verified_token` |
| staging | `verified_token` only |
| production | `verified_token` only |

Mock auth is **impossible** in staging/production via Startup Guard (`env.ts` + `authModeGuard.ts`).

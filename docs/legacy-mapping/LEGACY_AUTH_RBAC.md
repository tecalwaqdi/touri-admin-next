# Legacy Auth & RBAC

## Mechanism

1. Firebase Auth user
2. Profile in `user/{uid}`
3. Custom claims derived by `panel_claims.js` / `syncUserClaimsOnWrite`
4. Admin UI: `AdminRoleService` + `AuthClaims`

## isAdminRule matrix (`panel_claims.js`)

| Rule | Claims | AdminRole |
|---|---|---|
| 1 | super_admin + finance + support | superAdmin |
| 2 | country_admin + support (NOT finance) | countryAgent (scoped) |
| 3 | partner | partner |
| 4 | transport_manager | transportCompany |
| 5 | finance only | accountant |
| Isagent/isagent | agent + support | countryAgent |

Country scope claim: `country_id` = path of `Rev_dloh_agent` or `Rev_dolh`.

## Admin Next comparison (synthetic)

Admin Next roles (super_admin, country_admin, agent_user, accountant, …) are **not** wired to Legacy claims. Mapping required before Production Read.

| Legacy | Admin Next (approx) | Notes |
|---|---|---|
| super_admin | super_admin | closest |
| country_admin / agent | country_admin / agent_user | Legacy merges agent+country_admin UX carefully |
| finance (rule 5) | accountant | read-only finance |
| partner / transport_manager | (partial / missing) | Admin Next coverage incomplete |

## Confidence

Claims derivation: **high**. Full route matrix: **medium** (large `canAccessRoute` table — tested for finance routes).

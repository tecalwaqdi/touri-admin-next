# LEGACY_CLAIMS_TO_ADMIN_NEXT_MAPPING

Evidence: `admin/Admi/firebase/functions/panel_claims.js` (`deriveClaimsFromUserData`).

| Legacy claim / rule | Meaning | Evidence | Admin Next role | Admin Next scope | Confidence | Unknown / fail behavior |
|---|---|---|---|---|---|---|
| `isAdmin=true` / `IsAdmin=true` / `isAdminRule=1` → `super_admin` (+finance+support) | Super Admin | panel_claims.js L47–50 | `super_admin` | `global` | high | Grant global **only** via verified `claims.super_admin` after token verify — **never** from browser `isAdmin` / `x-role` |
| `isAdminRule=2` → `country_admin` (+support, NOT finance) | Country Admin | panel_claims.js L52–56 | `country_admin` | `country` (+ required `country_id`) | high | Missing `country_id` → **DENY** |
| `isAdminRule=3` / `is_partner` → `partner` | Partner | panel_claims.js L61–63 | — | — | low | `unsupported_legacy_role` → **DENY** (no invented Admin Next partner role) |
| `isAdminRule=4` → `transport_manager` | Transport company manager | panel_claims.js L64–66 | — | — | low | `unsupported_legacy_role` → **DENY** |
| `isAdminRule=5` → `finance` only | Accountant (read-only finance persona) | panel_claims.js L68–70 | `accountant` | `global` (may tighten later) | medium | No finance claim → not accountant |
| `Isagent` / `isagent` → `agent` (+support) | Agent user | panel_claims.js L57–60 | `agent_user` | `agent` + `country` | high | Require `agentId` + `countryId` + agent-belongs-to-country → else **DENY** |
| `support` alone | Support | often bundled | `support_agent` | `global` | medium | Rare alone |
| `country_id` from `Rev_dloh_agent` / `Rev_dolh` path | Country scope | panel_claims.js L72–75 | (scope only) | `country` | high | Path normalized to id |
| Unknown claim set | — | — | — | — | unknown | **DENY** — unknown claim ≠ admin; unknown role ≠ viewer |

## Super Admin decision (explicit)

Legacy derives `super_admin` from `isAdmin` **or** `isAdminRule=1` on the user document (Cloud Function).  
Admin Next **does** map verified `claims.super_admin=true` → global Super Admin (evidence-backed).  
Admin Next **does not** grant global for a client-supplied `isAdmin=true` header or body field without token verification.

## Code

- `src/domain/auth/ProductionIdentityVerifier.ts`
- `src/domain/auth/ProductionAuthDesign.ts` (`AUTH_CLAIM_MAPPING_TABLE`, `mapClaimsToIdentity`)

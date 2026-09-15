# Admin Next PC-4 Closure — Production Users / Roles / Audit

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-4 Production Users / Roles / Audit (READ-ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1/2/3 PASS (`7bafeb154a7253bdb3a3606db14b5302a3efccd8`)  
**Commit message:** `feat: add production admin users roles and audit reads`

## Goal

Safe READ-ONLY Production Admin Users directory, Roles/Permissions viewer, and Admin Audit log — without inventing sources, enabling writes, or reopening Auth/WIF ops.

## Section A — Source decision (inspect-first)

### Users

| Candidate | Verdict |
|---|---|
| Firebase Auth `listUsers` + claims | **Rejected** — auth-only Admin app refuses ADC; WIF transport is Firestore-native; would reopen Auth credential surface; mixes drivers/customers/admins |
| Dedicated `admin_users` collection | **Does not exist** |
| Legacy Firestore `user` panel personas (`IsAdmin` / `isAdminRule∈{1,2,5}`) | **CANONICAL** — already RO-allowlisted; `panel_claims` derives Auth claims from these fields; proven Legacy probe `IsAdmin==true limit 50` |

**Canonical:** `user` panel personas via WIF-native reads.  
**Legacy note:** Pure `Isagent` agents remain on Agents surface; included on Users only when they also carry a mappable Admin Next panel rule (e.g. `isAdminRule=2`). Rules 3/4 (partner / transport_manager) excluded with DQ warning — not invented into Admin Next roles.

### Audit

| Candidate | Verdict |
|---|---|
| Synthetic `AuditRepository` | Dev only — forbidden in Production |
| `finance_audit_events` | Finance-ops FR pilot audit — **not merged** into Admin Audit UI |
| `admin_next_cw_audit` | **CANONICAL for Admin Next CW audit** — exists in Production (Phase 5M/5N INTENT/RESULT); schema known; exact getById safe |

**Canonical:** `admin_next_cw_audit` (controlled-write subset — not a full platform action log).  
**Finance audit:** remains separate (`financeAuditMerged: false`).

### Roles

**Canonical:** code-defined `ROLE_PERMISSION_MATRIX` in `src/permissions/rbac.ts` — viewer only; no Production persistence; no UI-duplicated constants.

## Architecture

```
Browser
→ authenticated /api/users | /api/users/[id] | /api/audit | /api/audit/[id] | /api/roles
→ resolveApiActor + requirePermission
→ AdminUserReadService / AdminAuditReadService / RolesMatrixReadService
→ shared WIF runtime client (getProductionOperationalReadRuntime)
→ Firestore `user` | `admin_next_cw_audit` (allowlisted)
→ AdminUserListItem / AuditEvent / RoleMatrixRow DTOs
→ RO UI
```

No Firebase Admin ADC. No SA JSON. No Auth enumeration. No write RPCs. No custom-claims mutation.

## Contracts

### Users (`AdminUserListItem`)
id, emailMasked, displayName, role (server `panel_claims` mirror), scopeType/countryIds/agentIds, status, permissionCount, legacyRule, dataQualityWarnings[], `roleSource: "server_panel_claims_mirror"`.

Detail adds permissions[], SourceLabel, `transport: "wif_native"`, `synthetic: false`.

### Audit (`AuditEvent`)
Mapped from CW INTENT/RESULT docs; tokens/credentials redacted; filters actor/action/resourceType/environment on **loaded page**; pageSize default 20 max 50; cursor via `__name__`.

### Roles
`getRolesPermissionMatrix()` → roles[] + allPermissions; `mutable: false`; `source: "code_defined_rbac"`.

## RBAC

| Surface | Permission |
|---|---|
| `/api/users`, `/api/users/[id]`, `/users`, `/roles`, `/api/roles` | `users:manage` |
| `/api/audit`, `/api/audit/[id]`, `/audit` | `audit:read` |

IDOR: country-scoped actors cannot see global or other-country admin users; non-admin personas → **404** (no leak); source down → **503** (not “not found”).

## Redaction

Audit payloads redact keys matching password/secret/token/credential/authorization/api_key/private_key/refresh/id_token/access_token/session. Emails on Users are masked (`maskEmail`).

## Allowlist change

Added `admin_next_cw_audit` to `PRODUCTION_READ_COLLECTION_ALLOWLIST`.  
Did **not** add `finance_audit_events`. Did **not** expand `LIVE_SHADOW_ALLOWED_RESOURCES` (no ops env change).

## UI

- Users list + detail with SourceLabelBadge, StatusBadge, DQ warnings, Roles link
- Roles matrix page (`/roles`)
- Audit list/detail with CW hint, cursor next, unavailable vs not-configured states
- AR/EN strings for touched chrome only

## Non-regression

- Write flags unchanged (false)
- FR7 collections / aggregator unchanged
- WIF-native operational runtime reused
- ADC active reads = 0; Production synthetic fallback = 0
- Auth verify path unchanged (no Auth listing)
- PC-1/2/3 surfaces preserved

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1517 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Remaining for PC-5+

| Phase | Work |
|---|---|
| **PC-5** | Finance terminology / report UX (presentation only) |
| PC-6 | Cities/landmarks UI; deeper geo DQ |
| PC-7 | Full i18n/RTL |
| PC-8 | Visual/responsive polish |
| PC-9 | Controlled writes (only when deliberately enabled) |
| PC-10 | Commercial cutover / pilot exclusion defaults |

### Known PC-4 limitations (honest)

1. Users directory is a **bounded discriminator union sample** (≤50 merged), not an unbounded Auth directory.
2. Admin Audit is **controlled-write events only** — not general Admin Next HTTP/action audit.
3. No dedicated Admin Next–owned `admin_users` directory yet (future controlled phase).
4. Finance audit UI tab still deferred (must stay separate).

## Deploy

**NO** — PC-4 does not deploy and does not enable write flags.

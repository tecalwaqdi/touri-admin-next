# Admin Next — Final Completion

**Project:** `/Users/ventura/touri-admin-next`  
**Date:** 2026-09-15  
**Live URL (pre-DNS):** https://touri-admin-next.vercel.app  
**Posture:** Production reads armed (`PRODUCTION_READ_MODE=shadow`); **all write flags FALSE**.

## Executive summary

Admin Next is a **complete production administration product** for daily Touri Taxi operations at the default Vercel URL: list + detail reads across trips, drivers, customers, agents, geography, finance (FR7), users/roles, and controlled-write audit; controlled writes are **code-ready** and **pilot-packaged** but **not armed** in Production.

| Area | Status |
|---|---|
| Operational reads (7 + users + audit) | WIF-native, allowlisted, RBAC-scoped |
| Detail routes (core entities) | Wired via `ProductionOperationalDetailReads` |
| Controlled writes | Gated OFF; driver pilot package ready for operator approval |
| Users/Roles writes | **SECURITY-BLOCKED** — no proven least-privilege WIF claims path |
| Localization | AR/EN presentation layer (PC-7); RTL shell |
| DNS custom domain | **Operator pending** — do not change DNS in automation |

## Pre-DNS regression closure (Part 1)

| # | Item | Resolution |
|---|---|---|
| 1 | Users `user` vs `users`, WIF, panel_claims | Canonical collection `user`; `AdminUserReadService`; no Auth `listUsers` |
| 2 | Audit `admin_next_cw_audit` | RO list/detail; empty collection → HTTP 200 + `items: []` |
| 3 | Geography filter AR/EN | `resolveCountryFilterCanonicalId` accepts Arabic display labels (e.g. المملكة → `saudi_arabia`) |
| 4 | Raw enums in UI | `presentStatus` / `SourceLabelBadge` / role presentation |
| 5 | Geography names | `GeographyPresentation` + city alias resolver; IDs secondary |
| 6 | QA / cp5 badges | `GeographyDqBadge`, record class filters |
| 7 | Responsive nav | `AdminShell` mobile drawer |
| 8 | Dashboard KPI honesty | `metricsAvailability`, `kpiAccuracy`, bounded sample hints |
| 9 | CSP | No `apis.google.com/js/api.js`; Firebase Auth connect-src only |

## Live shadow allowlists

| Mode | `LIVE_SHADOW_ALLOWED_RESOURCES` |
|---|---|
| Phase 4B (current Vercel Production) | `countries,cities,landmarks,trips,drivers,agents,customers` |
| PC-10 full (optional ops upgrade) | above **plus** `users,audit` (nine tokens exact) |

Users/audit reads **do not** require live-shadow resource gates on queries (PC-4); the nine-token allowlist documents explicit ops intent only.

## Security invariants

- No SA JSON / no `GOOGLE_APPLICATION_CREDENTIALS` on Vercel  
- No client Firestore; no generic PATCH/write API  
- No finance calculation in React (FR7 read service only)  
- ONE COUNTRY ONE ACTIVE AGENT on agent writes (fail-closed)  
- Account deletion: customer/driver flows via website + Cloud Functions (not Admin write surface)

## Verification

```bash
cd /Users/ventura/touri-admin-next
npm test && npm run typecheck && npm run build && git diff --check
```

## Related artifacts

- `docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md`  
- `docs/ADMIN_NEXT_FINAL_LIVE_VALIDATION.md`  
- `docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md`  
- `docs/ADMIN_NEXT_PC10_CUTOVER.md`  
- `docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md`

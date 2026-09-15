# Admin Next PC-9 Closure — Controlled Admin Writes (Gated)

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-9 Controlled Admin Writes  
**Date:** 2026-09-15  
**Baseline:** PC-1..8 PASS (`f4a73a37f439ce3b410f4fdc51d276abd762ea83`)  
**Commit message:** `feat: complete gated controlled admin writes`  
**Authoritative matrix:** `docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md`

## Goal

Complete gated controlled-write product surface for local/synthetic rehearsal while **Production write flags remain FALSE**, no deploy, no Production mutation, no generic write endpoint.

## Inventory verdict (A)

| Workstream | Domain | Readiness | Offline Fake | Production armed |
|---|---|---|---|---|
| W1 | Drivers | **READY_EXISTING** | Yes | **NO** |
| W2 | Agents | **READY_EXISTING** | Yes | **NO** |
| W3 | Geography | **DANGEROUS_DEFER** | No | **NO** |
| W4 | Finance SoD | **PARTIAL** (existing SoD only) | Yes (in-memory) | **NO** |
| W5 | Customers | **READY_EXISTING** (no deletion) | Yes | **NO** |
| W6 | Users/Roles | **NOT_APPROVED** (RO) | No | **NO** |

Code mirror: `src/domain/controlled-writes/Pc9ControlledWriteInventory.ts`.

## Architecture completed

```
Browser chrome (NEXT_PUBLIC_CONTROLLED_WRITES_UI / APP_ENV)
  → API (maybeShadowTrapResponse)
  → resolveApiActor + requirePermission
  → expectedCurrentState validation
  → feature gates (GLOBAL + resource; hard locks)
  → idempotency
  → ControlledWritesService / SettlementService
  → Fake bridged repo | Disabled Production repo
  → audit INTENT/RESULT
  → canonical error response
```

## PC-9 deltas shipped

1. **Inventory + exposure matrix** (docs + code).
2. **Enablement model** updated: `localOfflineWritesReady` + UI chrome gated; `productionWritesEnabled=false`.
3. **AR/EN confirmation UX** via `ControlledWriteConfirmPanel` + localized templates (agent activate uniqueness warning).
4. **Env gates:** `CUSTOMER_AUTH_WRITE_ENABLED`, `GEOGRAPHY_WRITE_ENABLED` (default false) + examples.
5. **Mutation inventory** lists driver/agent/customer action routes.
6. **Settlement action routes** now call `maybeShadowTrapResponse` (parity with create).
7. **Denied resources** extended: geography, users, roles, claims.
8. **Safety:** `assertProductionWriteAllowed("geography")` blocked.

## Explicitly NOT done (safe DEFER)

| Item | Status |
|---|---|
| `GLOBAL_PRODUCTION_WRITE_ENABLED=true` | **Forbidden** |
| Production Firestore adapters for Admin UI writes | Locked Disabled* |
| Geography create/update/cleanup | DANGEROUS_DEFER |
| Customer compliant deletion | DANGEROUS_DEFER |
| Users/Roles claims writes | NOT_APPROVED |
| Finance calc / Settlement V2 SM changes | Unchanged (inspect only) |
| Deploy / Vercel Production env / push | **NO** |

## Write Exposure Report (AB)

| Surface | Prod UI | Prod write | Offline | Generic/Patch/Client FS/SA/ADC/Synthetic | 
|---|---|---|---|---|
| Drivers | chrome flag only | 0 | Yes | **0** |
| Agents | chrome flag only | 0 | Yes | **0** |
| Customers | chrome flag only | 0 | Yes | **0** |
| Geography | hidden | 0 | No | **0** |
| Finance SoD | chrome flag only | 0 | Yes | **0** |
| Users/Roles | hidden | 0 | No | **0** |

**GENERIC WRITE / ARBITRARY PATCH / CLIENT FIRESTORE / SA JSON / ADC / SYNTHETIC = ZERO**

## Security static audit (AA)

- `scanProductionWriteSurface` clean
- No `firebase/firestore` in `src/features`
- Action routes: `resolveApiActor` + `requirePermission`; no `x-role` header trust
- No `genericWrite` / `arbitraryPatch` / `rawFirestoreMutation` API
- No SA private-key JSON in production infra

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1652 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Non-regression

- PC-1..8 closures preserved (reads, FR7, KPI honesty, i18n, DQ, polish)
- WIF-native reads unchanged; ADC active=0; synthetic Production fallback=0
- ONE COUNTRY = ONE ACTIVE AGENT unchanged
- Legacy admin RO unchanged
- Finance calculations unchanged

## Remaining for PC-10

1. Per-resource Production write arming plan (explicit operator approval; kill-switch).
2. Compliant customer deletion (if legally required).
3. Geography controlled writes without PC-6 auto-cleanup.
4. Users/Roles claims path only if security-approved.
5. Pilot exclusion default on commercial dashboards.
6. Full E2E cutover checklist.

## Blockers for Production write cutover

1. Production write flags must stay FALSE until operator harness + IAM + rollback proven.
2. Geography dirty-data cleanup is not a write feature — separate DQ program.
3. Customer Auth dual-write (`CUSTOMER_AUTH_WRITE_ENABLED`) still deferred.
4. Users/Roles mutation path not approved.

```
PRODUCTION FLAGS ARMED: NO
PUSHED: NO
DEPLOYED: NO
```

*End of PC-9 closure.*

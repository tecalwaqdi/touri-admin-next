# Admin Next PC-2 Closure — Production Detail Routes

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-2 Production Detail Routes  
**Date:** 2026-09-15  
**Baseline:** PC-1 PASS (`81180677199a7331845f2ada7d9a2fe48a92998b`)  
**Commit message:** `feat: add production detail reads for core admin resources`

## Goal

Wire safe, read-only Production detail GET for Trip, Driver, Customer, and Agent via the shared WIF-native read architecture, then re-enable DetailNavLink per resource.

## Architecture

```
Browser
→ authenticated /api/<resource>/[id]
→ resolveApiActor + requirePermission
→ ProductionOperationalDetailReads
→ ProductionOperationalReadRuntime (WIF-native)
→ getById / getSummaryById
→ canonical → detail DTO mapper
→ redacted DTO + SourceLabel
→ detail UI
```

No Firebase Admin ADC. No synthetic fallback when Production read is armed. No write RPCs on detail routes.

## Routes implemented

| Resource | API | Repo primitive | UI |
|---|---|---|---|
| Trip | `GET /api/trips/[id]` | `trips.getById` | `/trips/[id]` |
| Driver | `GET /api/drivers/[id]` | `drivers.getById` | `/drivers/[id]` |
| Customer | `GET /api/customers/[id]` | `customers.getSummaryById` | `/customers/[id]` |
| Agent | `GET /api/agents/[id]` | `agents.getById` + peers ≤20 + FR7 summary | `/agents/[id]` |

## DTO fields (summary)

Shared on all detail DTOs: `sourceLabel`, `availability`, `dataQualityWarnings[]`, `recordClass`, `synthetic: false`, `transport: "wif_native"`, `piiRedacted`.

- **Trip:** id, status/lifecycle, parties, country/city, landmarks, payment/currency, timestamps, cancellation, financialSafeRead amounts (null when missing), mapping metadata.
- **Driver:** identity (name; email/phone null under shadow redaction), registration/approval/availability, vehicle (name/model/type/plateMasked), compliance slots, operational trip state, non-authoritative financial flags.
- **Customer:** identity with masked hints only, account state, geography representation, bookingsCount when known, deletion/retention marked unavailable when not in canonical.
- **Agent:** identity, country/bucket, operational active state, one-country-one-active-agent invariant, FR7 finance summary when `finance:read` + country linkable, settlements list capped ≤20.

## RBAC / scope

- Server-authoritative via `resolveApiActor` + permission gates.
- Detail scope via `assertDetailResourceInScope` using canonical country equality (`SA` ≡ `saudi_arabia`).
- Repository getById also uses `isCountryInScopedList` (canonical).
- IDOR: country_admin / agent_user denied outside scope; super_admin global allowed.
- Missing country for scoped actors → deny (fail-closed).

## Bounded related reads

- Constant: `PRODUCTION_DETAIL_RELATED_READ_LIMIT = 20`
- Agent peer list for invariant: `limit ≤ 20`
- Agent settlements slice: `≤ 20`
- No N+1 history fan-out; trip/driver/customer detail = exact get (+ customer exclusion gate)

## Semantics

| Condition | HTTP / UI |
|---|---|
| Record truly missing / non-persona | **404** + `NotFoundState` |
| WIF/source unavailable / kill switch | **503** + `UnavailableState` (not “not found”) |
| Missing financial field | `null` + availability `missing`/`unavailable` — never `0` |

## Navigation

`PRODUCTION_DETAIL_RESOURCE_ENABLED` enables DetailNavLink per resource (`trips|drivers|customers|agents` all `true` after PC-2 wiring). Incomplete resources can remain `false` independently.

## Data-quality warnings (non-blocking)

Missing country/name, legacy/malformed country IDs, incomplete vehicle/docs, inconsistent registration/account, suspicious agent mapping, duplicate active agents.

## Deferred to PC-3

- Richer list columns (real agent/driver counts, customer tripCount mapping on lists)
- Deeper document/vehicle presentation polish
- Country filter display-name alignment across lists
- Scheduled trip time / route geometry when not persisted
- Customer deletion/retention when a Production source exists
- Broader operational KPIs beyond FR7 agent summary

## Non-regression

- Write flags unchanged (all false)
- FR7 aggregator / settlement logic unchanged (agent detail reuses `agentSummary` only)
- WIF-native runtime unchanged (detail reuses it)
- PC-1 KPI honesty / source labels / Users-Audit fail-closed preserved
- Users/Audit still PC-4

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1473 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Deploy

**NO** — PC-2 does not deploy and does not enable write flags.

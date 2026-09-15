# Admin Next PC-3 Closure — Operational Completeness

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-3 Operational Completeness (READ-ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1+PC-2 PASS (`4e4bb820718896b7afe0d3d17a43039088b21226`)  
**Commit message:** `feat: complete core read-only admin operations`

## Goal

Make Trips / Drivers / Customers / Agents useful for daily admin without enabling writes: denser list/detail fields, honest aggregates, canonical country filters, safe pagination or honest bounded UI.

## Operational fields added

### Trips list (`TripListItem`)
ID, status, customer/driver display refs (shortened IDs — names not on trip canonical), country/canonicalCountryId, city, pickup/destination landmark IDs, payment method, currency, gross fare (availability-aware), cancellation state/reason, DQ warnings when needed.

### Drivers list (`DriverListItem`)
Display name (fallback hierarchy), country/city, registration/approval/availability/online/account, vehicle summary, document completeness, tripCount as **unavailable** aggregate (no efficient exact source), createdAt when present.

### Driver detail sections
Overview · Registration · Contact/location · Vehicle · Documents (slot presence only; no upload/edit) · Operational · Trip summary (unavailable) · Finance (canonical non-authoritative / unavailable).

### Customers list (`CustomerListItem`)
Display name, masked email/phone hints, country/city, account state, createdAt, **tripCount** with accuracy (`exact` from `bookingsCount` when known; else `unavailable`/`missing` — **never fabricated 0**), deletion/retention marked unavailable.

### Agents list (`AgentListItem`)
Display name, country display name + canonical id, status, currency hint, **driversCount/tripsCount unavailable** (never fabricated 0), settlement outstanding unavailable on list (FR7 on detail when linkable), DQ warnings for suspicious mapping.

## Filters added

| Surface | Server-side | Loaded-page (labeled) |
|---|---|---|
| Trips | status, countryId (canonical), cityId | paymentMethod, search (ID) |
| Drivers | countryId, cityId, online≈availability | registrationStatus, other availability, search |
| Customers | countryId, cityId | accountState, search |
| Agents | countryId | status active/inactive, search |
| Dashboard | countryId resolved to canonical | — |
| Finance/Settlements/Reports | ISO2 filter values (FR7 exact match) with display names | — |

Search that is not server-side is scoped to the loaded page and labeled (`searchLoadedPageHint`).

## Accuracy / availability semantics

- Aggregate fields use `{ value, accuracy: exact\|bounded_sample\|unavailable, availability }`.
- Missing ≠ 0; Unknown ≠ false; Unavailable ≠ empty / fabricated zero.
- Customer tripCount: exact when `bookingsCountKnown`; otherwise unavailable/missing.
- Agent driver/trip counts: unavailable (no N+1 fan-out).
- Driver tripCount: unavailable.
- Money fields keep availability; null when missing.

## Pagination status

- WIF repos already return `nextCursor` / `truncated`.
- UI wired to **cursor stack** (prev/next) with `pageSize ≤ 20` (hard-capped ≤50 via `WIF_NATIVE_MAX_READ_LIMIT`).
- Bounded-results hint always shown — not presented as full DB totals.
- No offset-based full scans.

## Metrics deliberately left unavailable

| Metric | Reason |
|---|---|
| Agent driversCount / tripsCount | Would require per-row related queries (N+1) |
| Driver tripCount | Not on canonical driver model |
| Customer deletion/retention | Not in canonical RO model |
| Agent list FR7 outstanding | Avoid N+1; FR7 remains on agent detail when `finance:read` |
| Trip scheduledAtUtc / party display names | Not persisted / would need related gets |
| Driver region / document expiry verification | Not fully represented in canonical slots |

## Canonical gaps (not inventable in PC-3)

- Party display names on trips (only IDs on order docs)
- Exact global totals / unbounded search
- Customer account-deletion Production source
- Cities/landmarks product UI (PC-6)
- Full i18n of all chrome (PC-7)

## Country filter alignment

- `CountryOption { canonicalId, displayNameAr, displayNameEn, currency, availability }`
- Operational APIs resolve filters via `resolveCountryFilterCanonicalId` (`SA` → `saudi_arabia`)
- UI `CountryFilterSelect` uses **canonicalId** as value; names presentation-only
- Finance surfaces use `FinanceCountryFilterSelect` with **ISO2** values (FR7 exact string match — compatible exception; no FR7 calc change)

## Non-regression

- PC-1 KPI honesty preserved
- PC-2 detail routes / DetailNavLink preserved
- WIF-native transport unchanged
- ADC active reads = 0; synthetic Production fallback = 0
- Write RPCs / write flags unchanged (false)
- One-country-one-active-agent preserved
- FR7 aggregator unchanged

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1497 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Remaining for PC-4+

| Phase | Work |
|---|---|
| **PC-4** | Users + Audit Production RO sources |
| PC-5 | Finance terminology / report UX |
| PC-6 | Cities/landmarks UI; deeper geo DQ cleanup |
| PC-7 | Full i18n/RTL |
| PC-8 | Visual/responsive polish |
| PC-9 | Controlled writes |
| PC-10 | Commercial cutover / pilot exclusion defaults |

## Deploy

**NO** — PC-3 does not deploy and does not enable write flags.

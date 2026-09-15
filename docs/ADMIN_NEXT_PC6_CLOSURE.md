# Admin Next PC-6 Closure — Geography & Data Quality

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-6 Geography & Data Quality (READ-ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1..5 PASS (`681172341b8d1b32f53f4bfdac35d3d064567b38`)  
**Commit message:** `feat: complete geography and data quality views`

## Goal

Complete geography read UX and a reliable (honestly bounded) data-quality picture for Countries / Cities / Landmarks, Country↔Agent mapping, currency/display-name alignment, and legacy/QA/pilot geography — without mutating Production data.

## Surfaces delivered

| Surface | Route / API | Notes |
|---|---|---|
| Geography hub (tabs) | `/geography` | Countries · Cities · Landmarks · Data Quality |
| Country detail | `/geography/countries/[id]` · `GET /api/geography/countries/[id]` | Related cities ≤20 |
| City detail | `/geography/cities/[id]` · `GET /api/geography/cities/[id]` | Related landmarks ≤20 |
| Landmark detail | `/geography/landmarks/[id]` · `GET /api/geography/landmarks/[id]` | Metadata only (no image fetch) |
| Cities list API | `GET /api/geography/cities` | WIF-native Legacy `villages` |
| Landmarks list API | `GET /api/geography/landmarks` | WIF-native Legacy `mkan` |
| DQ summary API | `GET /api/geography/data-quality` | `metricsAccuracy: bounded_sample` |

## Domain helpers (centralized)

| Module | Role |
|---|---|
| `CountryIdentityClassification.ts` | canonical / known_alias / legacy / malformed / unknown |
| `CurrencyAlignment.ts` | stored vs expected; missing ≠ SAR default; no FX |
| `CountryAgentInvariant.ts` | PASS / NO_ACTIVE_AGENT / VIOLATION / DATA_QUALITY_WARNING |
| `CityDataQuality.ts` / `LandmarkDataQuality.ts` | DQ detectors |
| `GeographyDataQuality.ts` | INFO / WARNING / ERROR / INVARIANT_VIOLATION |
| `GeographyRecordClass.ts` | production / production_pilot / legacy / qa / unknown (not prefix-only) |
| `GeographyDqSummary.ts` | bounded_sample summary model |
| `GeographyPresentation.ts` | bilingual display names (never invent) |

## Invariants preserved

- ONE COUNTRY = ONE ACTIVE AGENT (diagnostic + seed policy)
- Canonical country IDs authoritative; display names presentation-only
- Filters/API use canonical IDs
- Counts that need N+1 → `unavailable` (never fabricated 0)
- Page size ≤50 (`WIF_NATIVE_MAX_READ_LIMIT`); related detail reads ≤20
- WIF-native Production reads; ADC=0; synthetic Production fallback=0; writes=0
- No Firestore mutate/delete/rename; no agent reassignment; no deploy

## Non-regression

- PC-1..5 surfaces preserved
- FR7 calculations untouched
- Auth / WIF / RBAC / scope (IDOR via `assertDetailResourceInScope`) preserved

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1568 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Remaining for PC-7+

| Phase | Work |
|---|---|
| **PC-7** | Full-app i18n/RTL beyond geography/finance chrome |
| PC-8 | Visual/responsive polish |
| PC-9 | Controlled writes (only when deliberately enabled) |
| PC-10 | Commercial cutover / pilot exclusion defaults |

### Known PC-6 limitations (honest)

1. City/landmark **counts on country rows** are unavailable (no efficient aggregate without N+1).
2. DQ summary metrics are **bounded_sample** (≤50 per resource window), never exact Production totals.
3. Landmark category/type often unavailable (not represented on canonical when absent).
4. Dirty Production CP5/pilot geography is **classified and reported only** — no cleanup writes.

*End of PC-6 closure.*

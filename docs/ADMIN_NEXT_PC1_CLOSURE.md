# Admin Next PC-1 Closure — Critical Correctness

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-1 Critical Correctness  
**Date:** 2026-09-15  
**Commit message:** `fix: close PC-1 production correctness gaps`

## Problem

Production Admin Next was read-capable but operator-misleading:

1. Dashboard operational KPIs were bounded samples (≤50) labeled as totals.
2. Pilot/test Production documents could pollute KPI interpretation without truthful metadata.
3. Source labels were incomplete on major lists; synthetic wording risked mislabeling Production.
4. Raw status enums misled operators (`pending_review`, `no_active_agent`, etc.).
5. Geography presented raw IDs, missed display names, and weak agent↔country alias matching.
6. Users/Audit fail-closed correctly but UI still offered useless Development defaults/retry.
7. Detail deep-links falsely surfaced as “not found” when Production detail routes are disabled.
8. Critical terminology conflated Total vs Sample, Missing vs 0, Unavailable vs empty.

## Correction (PC-1 only)

### Dashboard KPI honesty
- Per-KPI `kpiAccuracy`: `exact | bounded_sample | unavailable`.
- Production ops KPIs always `bounded_sample` with `boundedSampleLimit ≤ 50`.
- UI labels renamed to Sample… / عينة…; hints on every ops card.
- No unbounded scans; DashboardService capped to `WIF_NATIVE_MAX_READ_LIMIT`.
- Money fields remain `null` / FR7-only (Missing/Unknown never coerced to 0).

### Pilot/test classification (no deletion)
- `RecordClassification` uses contractual markers + `mappingStatus` / domain evidence.
- KPI path marks `sampleIncludesPilotOrTest` instead of silently dropping rows.
- Finance pilot source label `Production / pilot records present` preserved.

### Source labels
- Centralized codes: `production | production_pilot | unavailable | development_synthetic`.
- Shared `SourceLabelBadge` on Dashboard, Finance, Settlements, Reports, Drivers, Customers, Agents, Geography, Users, Audit.
- Production Firestore never labeled development_synthetic solely because IDs contain `test_`.

### Status presentation
- Centralized AR/EN mapper for correctness-affecting statuses.
- Domain enums unchanged (`data-status-domain` preserves raw value).

### Geography
- Display name from live name or canonical table (never fabricated).
- Agent↔country matching via canonical bucket (`SA` ↔ `saudi_arabia`).
- Data-quality warnings: malformed/legacy IDs, missing names, suspicious active agent, duplicate active agents.
- Countries list limit raised safely to ≤50.

### Users / Audit
- Fail-closed unchanged (no fixture fallback).
- Clear AR/EN “source not configured” messaging.
- No retry on not-configured; Audit Development environment filter removed outside development.

### Detail false-not-found
- List detail links disabled in staging/production with “coming next phase” copy.
- Detail pages detect `PRODUCTION_READ_DISABLED` → “تفاصيل الإنتاج غير مفعّلة بعد” (not “not found”).
- Detail route wiring deferred to PC-2.

## Non-regression verified

- AUTH verified_token path unchanged
- WIF-native operational reads unchanged
- Old ADC active read paths = 0
- Production synthetic fallback = 0
- Write RPCs / write gates remain false
- One-country-one-active-agent enforced
- FR7 calculations/aggregator unchanged

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1453 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Remaining PC-2+ work

| Phase | Work |
|---|---|
| **PC-2** | Wire Production detail GET for trip/driver/customer/agent; truthful source badges on details; enable DetailNavLink |
| PC-3 | Expand list/detail fields; fix mapper zeros (agent counts, customer tripCount) |
| PC-4 | Real Users + Audit Production RO sources |
| PC-5 | Finance terminology/localization polish |
| PC-6 | Cities/landmarks UI; deeper geo DQ cleanup |
| PC-7 | Full i18n/RTL |
| PC-8 | Visual/responsive polish |
| PC-9 | Controlled writes (only when deliberately enabled) |
| PC-10 | Commercial cutover / pilot exclusion defaults |

## Data-quality issues requiring later controlled cleanup

These are **presentation/classification only** in PC-1 — no Production mutation:

1. `cp5_country_*` and other test/noncanonical country docs still present in Production collections.
2. Possible Saudi active-agent “Touri Super Admin” contamination — warned when signals match; live RO evidence needed before any write/quarantine.
3. FR7 / `test_adminnext_*` pilot finance docs remain in Production (correctly labeled `production_pilot`).
4. OTP QA / fixture drivers/customers — classified when markers exist; not deleted.
5. Countries/agents still may truncate at ≤50 (honest bounded sample) until safe aggregates exist.

## Deploy

**NO** — PC-1 does not deploy and does not enable write flags.

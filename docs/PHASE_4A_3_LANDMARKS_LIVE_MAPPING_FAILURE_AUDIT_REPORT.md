# TOURI TAXI ADMIN NEXT — PHASE 4A-3 LANDMARKS LIVE MAPPING FAILURE AUDIT REPORT

**Date:** 2026-09-12  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Legacy (READ-ONLY):** `/Users/ventura/ara-ban`  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Trips / Phase 4A-4:** **NOT started**

---

## Verdict

**CONDITIONAL GO** for **one final operator-controlled** Landmarks live verification after this harness fix.

Phase 4A-3 remains **NO-GO for closure** until that live window produces:

- `overallStatus=PASS` **or** an identified mapping fix with evidence
- `.local/phase4a3-live/live-safe-summary.json`
- `killSwitch=PASS` / `postKill=PRODUCTION_READ_DISABLED_NO_NEW_QUERY`
- closing gates all zero

Fake/unit + typecheck + build: **PASS** (no live auto-run).

---

## Prior live window (evidence)

Source artifacts (pre-fix):

| Artifact | Observation |
|---|---|
| Vitest | **4/4 PASS** (incorrect — mapping failure did not fail the test) |
| `.local/phase4a3-live/landmarks-live-safe-report.json` | Wrong path; `overallStatus=NO_GO`, `unmappedCountry=1`, `testOrNoncanonical=1`, `validMapped=48`, `recordsRead=50`, `firestoreQueries=1` |
| `.local/phase4a3-live/live-safe-summary.json` | **Not produced** |
| `observability.ndjson` | `production_read_request`, `mapping_warning:test_or_noncanonical_landmark`, `mapping_failure:unmapped_country` — **no** `kill_switch_triggered` |
| Safe landmark diagnostics (id / Rev_dolh / id_vill) | **Absent** from prior report |

---

## Root cause

### A) Harness defects (confirmed — fixed)

1. **False PASS:** Mapping gate set `report.overallStatus=NO_GO` but never `expect.fail` / threw — Vitest stayed green.
2. **Wrong summary path:** Wrote `landmarks-live-safe-report.json` instead of `live-safe-summary.json`.
3. **Kill switch not observable:** Kill path created a disabled repository but did **not** emit `kill_switch_triggered` (unlike Phase 4A-2). Early asserts (e.g. `malformed===0`) could also skip cleanup — fixed with `try/finally`.
4. **No safe unmapped diagnostics:** Prior report omitted `sourceDocumentId`, `Rev_dolh` path, and independent city/region mapping.

### B) Mapping failure (partially known — exact ID pending next live)

From prior stats: **exactly one** `unmappedCountry` among ≤50 `mkan` rows (plus one expected `testOrNoncanonical`).

Closed Phase 4A-1 inventory (`live-safe-summary` countries): 12 valid IDs all present in `COUNTRY_CANONICAL_TABLE` (`saudi_arabia`, `kyrgyzstan`, `spain`, `morocco`, `portugal`, `tunisia`, `indonesia`, `malaysia`, `india`, `niger`, `chad`, `nigeria`) + CP5 test.

Therefore, if `Rev_dolh` extracted cleanly to one of those 12 IDs, mapping would succeed. The live `unmapped_country` implies one of:

| Class | Meaning | Action this session |
|---|---|---|
| **missing Rev_dolh** | null / unparseable field → `countryMapping=missing` | Diagnostics only — do not invent country from name/coords |
| **absent from 4A-1 table / orphan ref** | `Rev_dolh` → id **outside** closed inventory (e.g. Legacy content scripts mention `egypt`, `georgia`, `kazakhstan`, `turkmenistan`, hyphenated gulf ids in `verify_toury_content.js`) | **Do not alias without exact live id + Legacy evidence** |
| **CP5 / functional test** | Would be `testOrNoncanonical` (already counted separately = 1) | Not the unmapped row |
| **deleted-missing / stale** | Ref path preserved; country doc may not exist | Preserve path; do not repair Production |
| **wrong field type** | Extract yields unexpected string | Report path / type in diagnostics |

**No canonical country row was added** — exact `sourceDocumentId` / `sourceCountryReferencePath` were not in the prior artifact; guessing from landmark name/coords is banned.

---

## Affected identity (prior window)

| Field | Value |
|---|---|
| affected sourceDocumentId(s) | **Unknown** (prior report omitted) — next live writes `unmappedLandmarkDiagnostics[]` |
| safe landmark name(s) | **Unknown** pending next live |
| source country reference(s) | **Unknown** pending next live (`countries/<id>` or null if missing `Rev_dolh`) |
| source city reference(s) | **Unknown** pending next live (`villages/<id>`) |
| classification | **Blocking `unmappedCountry` (1)** + expected **`testOrNoncanonical` (1)**; exact subclass deferred to diagnostic-enabled live |

Independent relation assessment (code ready for next live):

```text
countryMapping / cityMapping / regionMapping
```

Country failure no longer hides city/region presence in diagnostics (`LandmarkLiveMappingDiagnostics`).

---

## Code changes

| File | Change |
|---|---|
| `src/domain/geography/LandmarkLiveMappingDiagnostics.ts` | **New** — closing gates, safe diagnostics, independent country/city/region mapping, sensitive-leak guard, NO-GO message |
| `src/test/live/phase4a3-live-landmarks.shadow.test.ts` | Harness rewrite: `live-safe-summary.json`, `try/finally` kill switch + emit, fail on mapping gates, stage durations, unmapped diagnostics, query count === 1 |
| `src/test/unit/phase4a3-landmark-mapping-failure-audit.test.ts` | **New** — Objective 8 regressions |
| `docs/PHASE_4A_3_LANDMARKS_LIVE_MAPPING_FAILURE_AUDIT_REPORT.md` | This report |

**Not changed:** Production data, Legacy tree, Phase 4A-1/4A-2 mapping tables (no speculative country adds), Trips.

---

## Harness correction

| Requirement | Status |
|---|---|
| `unmappedCountry===0` … `unexpectedCollections.length===0` required to PASS | **Enforced** via `landmarkLiveClosingGatesPass` + `expect.fail` |
| `mapping_failure` → `overallStatus=NO_GO`, readiness false, live test FAIL | **Yes** |
| Summary always at `.local/phase4a3-live/live-safe-summary.json` | **Yes** (PASS / NO-GO / Auth / assertion — `finally`) |
| Kill switch in `finally`; `killSwitch=PASS`; `postKill=PRODUCTION_READ_DISABLED_NO_NEW_QUERY` | **Yes** + explicit `kill_switch_triggered` emit |
| Safe unmapped diagnostics | **Yes** |
| Stage durations (auth / fingerprint / landmarkQuery / mapping / duplicateAudit / killSwitch) | **Yes** |
| Single bounded `mkan` query (no countries/villages/Storage N+1) | **Assert `firestoreQueries===1`** |

---

## Performance note (prior ~27s)

Prior window: auth request ~20s before mapping events; **one** Firestore query (`firestoreQueries=1`). No evidence of per-landmark country/city/Storage queries. Do **not** raise global timeout — stage durations will show auth vs query split on next live.

---

## Tests / typecheck / build

```text
npm test     → 334 passed | 2 skipped (38 files)
npm run typecheck → PASS
npm run build     → PASS
```

Phase 4A-3 new audit suite: **10** tests in `phase4a3-landmark-mapping-failure-audit.test.ts`.  
Live harness always-on: **5** (includes closing-gate regression; live body still skipped without `PHASE4A3_LIVE_LANDMARKS=1`).

---

## Operator next step (manual only — not run by this agent)

```bash
PHASE4A3_LIVE_LANDMARKS=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a3-live-landmarks.shadow.test.ts
```

Expect either:

1. **FAIL/NO_GO** with `unmappedLandmarkDiagnostics` identifying exact `sourceDocumentId` + `sourceCountryReferencePath` (then evidence-backed mapping or documented orphan), or  
2. **PASS** if inventory no longer contains the blocking row.

---

## GO / NO-GO summary

```text
TOURI TAXI ADMIN NEXT — PHASE 4A-3 LANDMARKS LIVE MAPPING FAILURE AUDIT REPORT
root cause: harness false-PASS + wrong summary path + missing kill observability;
            mapping: 1× unmappedCountry among first 50 mkan (exact Rev_dolh pending diagnostics)
affected sourceDocumentId(s): unknown until next live (diagnostics now wired)
safe landmark name(s): unknown until next live
source country reference(s): unknown until next live
source city reference(s): unknown until next live
classification: blocking unmappedCountry (not CP5); subclass TBD from Rev_dolh path
code changes: LandmarkLiveMappingDiagnostics + live harness rewrite + audit unit tests
harness correction: FAIL on gates; live-safe-summary.json; finally kill switch; safe diags; stage timings
test count: 334 passed | 2 skipped
typecheck: PASS
build: PASS
Production calls = 0
Production writes = 0
CONDITIONAL GO for one final live verification
STOP. No Phase 4A-4 Trips.
```

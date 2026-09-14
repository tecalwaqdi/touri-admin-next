# TOURI TAXI ADMIN NEXT — PHASE 4A-3 `demo_saudi` LEGACY ALIAS RESOLUTION REPORT

**Date:** 2026-09-12  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Legacy (READ-ONLY evidence):** `/Users/ventura/ara-ban`  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Trips / Phase 4A-4:** **NOT started**

---

## Verdict

**CONDITIONAL GO** for **one operator-controlled** final Landmarks live verification.

Offline Fake/unit + typecheck + build: **PASS**.  
Phase 4A-3 remains **NO-GO for closure** until that live window produces closing gates PASS (or an evidence-backed residual mapping report).

---

## Legacy evidence (confirmed READ-ONLY)

| Source | Proof |
|---|---|
| `admin/Admi/lib/core/country/country_resolver.dart` | `legacySaudiIds = ['saudi_arabia', 'demo_saudi']`; `canonicalSaudiId = 'saudi_arabia'` |
| `admin/Admi/lib/backend/admin_saudi_country.dart` | `knownDocIds = ['saudi_arabia', 'demo_saudi']` |
| `admin/Admi/tools/backend_crud_audit.ps1` | Treats `saudi_arabia` and `demo_saudi` as equivalent for city `dolh` |
| `admin/Admi/lib/backend/admin_ops_country_scope.dart` | Saudi ops scope includes both document refs |

**Not used as alias evidence:** name/city/coords inference; blanket `demo_*` patterns; Landmark-only special cases.

`curated_makkah_clock_tower` is payment/session operational content — **not** test-only. Classification remains `valid_candidate` (not `testOrNoncanonical`).

---

## Alias added

| Field | Value |
|---|---|
| Alias source ID | `demo_saudi` (also `countries/demo_saudi` via path normalize) |
| Canonical country | `saudi_arabia` |
| Layer | Phase 4A-1 `COUNTRY_CANONICAL_TABLE` / `resolveCanonicalCountryId` |
| Matched via | `alias` (exact source-ID) |
| Second canonical country? | **No** |
| Expose `demo_saudi` as separate country? | **No** |
| Other `demo_*`? | Remain **unmapped** (e.g. `demo_unknown`, `demo_egypt`, `demo_ksa`) |

---

## Code changes

| File | Change |
|---|---|
| `src/domain/geography/CountryCanonicalization.ts` | Add exact alias `demo_saudi` → `saudi_arabia` + Legacy evidence string |
| `src/infrastructure/production/mappers/LegacyProductionMappers.ts` | Landmark mapper preserves `sourceCountryDocumentId` + `canonicalCountryId` |
| `src/infrastructure/production/contracts/ProductionReadRepositories.ts` | `CanonicalLandmarkReadModel` gains source/canonical country fields |
| `src/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository.ts` | Pass through new fields |
| `src/domain/geography/LandmarkLiveMappingDiagnostics.ts` | Prefer `sourceCountryDocumentId` for `sourceCountryReferencePath` |
| `src/test/live/phase4a3-live-landmarks.shadow.test.ts` | Wire source country id into diagnostics |
| `src/test/unit/phase4a3-demo-saudi-alias.test.ts` | **New** — required alias + Clock Tower regressions |
| `src/test/unit/phase4a1-countries-gate.test.ts` | Regression: `demo_saudi` alias; `demo_unknown` unmapped |

**Not changed:** Production data, Legacy tree, Trips / Phase 4A-4, speculative other-country aliases.

---

## Affected landmark (blocking live row)

| Field | Expected after alias |
|---|---|
| sourceDocumentId | `curated_makkah_clock_tower` |
| Rev_dolh (source) | `countries/demo_saudi` |
| id_vill | `villages/city_sa_makkah` |
| countryId / canonicalCountryId | `saudi_arabia` |
| sourceCountryDocumentId | `demo_saudi` (preserved) |
| cityId | `city_sa_makkah` |
| mappingStatus | `validMapped` |
| classification | **not** `testOrNoncanonical` |

Prior live window: `countryMapping=unmapped`, `cityMapping=present` — explained by missing `demo_saudi` alias (city already present).

---

## Tests

| Case | Result |
|---|---|
| `countries/demo_saudi` → `saudi_arabia` | PASS |
| `countries/saudi_arabia` → `saudi_arabia` | PASS |
| `countries/demo_unknown` → NOT Saudi | PASS |
| Clock Tower + `demo_saudi` + `city_sa_makkah` → `validMapped` + source preserved | PASS |

New suite: `phase4a3-demo-saudi-alias.test.ts` — **6** tests.

---

## Validation (offline — no Production)

```text
npm test          → 341 passed | 2 skipped (343) — 39 files
npm run typecheck → PASS
npm run build     → PASS
Production calls  → 0
Production writes → 0
```

---

## Operator next step (manual only — NOT run by this agent)

```bash
PHASE4A3_LIVE_LANDMARKS=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a3-live-landmarks.shadow.test.ts
```

### Expected live gates

- `overallStatus=PASS` (or residual NO-GO with exact diagnostics — not harness false-PASS)
- `.local/phase4a3-live/live-safe-summary.json` produced
- `unmappedCountry===0`, `unmappedCity===0`, `ambiguousCountry===0`, `ambiguousCity===0`, `malformed===0`
- `activeOperationalDuplicates===0`, `productionWriteCalls===0`, `unexpectedCollections.length===0`
- `killSwitch=PASS` / `postKill=PRODUCTION_READ_DISABLED_NO_NEW_QUERY`
- Clock Tower row (if in first ≤50): `countryId=saudi_arabia`, `sourceCountryDocumentId=demo_saudi`, `mappingStatus=validMapped`
- `testOrNoncanonical` may remain > 0 for CP5 only (reported, not aliased)
- Single bounded `mkan` query (`firestoreQueries===1`)

---

## GO / NO-GO summary

```text
TOURI TAXI ADMIN NEXT — PHASE 4A-3 `demo_saudi` LEGACY ALIAS RESOLUTION REPORT

Legacy evidence: CountryResolver.legacySaudiIds + AdminSaudiCountry.knownDocIds + ops scope + CRUD audit
alias added: demo_saudi → saudi_arabia (exact source-ID; Phase 4A-1 country layer)
canonical country: saudi_arabia (no second canonical; no other demo_* blanket)
affected landmark: curated_makkah_clock_tower → validMapped; sourceCountryDocumentId=demo_saudi preserved
tests: 6 new + 1 Phase 4A-1 regression; Clock Tower / demo_unknown covered
full test count: 341 passed | 2 skipped (343)
typecheck: PASS
build: PASS
Production calls = 0
Production writes = 0
GO / NO-GO for final Landmarks live verification: CONDITIONAL GO (one operator-controlled window)
STOP. No Phase 4A-4 Trips.
```

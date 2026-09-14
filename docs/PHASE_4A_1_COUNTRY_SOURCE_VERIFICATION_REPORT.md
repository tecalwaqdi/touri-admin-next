# TOURI TAXI ADMIN NEXT — PHASE 4A-1 COUNTRY SOURCE / TEST-RECORD VERIFICATION REPORT

**Date:** 2026-09-11  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Legacy reference (READ-ONLY):** `/Users/ventura/ara-ban`  
**Phase:** 4A-1 Country Source Verification (4A-1 sub-phase; **not** Cities / 4A-2)

---

## Executive summary

Authoritative Production country list is Firestore collection `countries`. The prior live window (`recordsRead: 1`, `recordsMapped: 0`, doc `cp5_country_1787562918003` / `FUNCTIONAL TEST COUNTRY`) is explained by a **repository `orderBy("name")` bug**: Legacy countries use `naim` (Admin create path never writes `name`). Firestore `orderBy` also requires field existence, so only the Checkpoint5 E2E fixture (which sets both `name` and `naim`) was returned.

`FUNCTIONAL TEST COUNTRY` is a **test/noncanonical** record from Legacy `checkpoint5_admin_az_e2e.js`. It must **not** receive a canonical alias. Admin Next now classifies it as `test_or_noncanonical` and orders countries by `naim`.

**Live Production inventory this window:** SKIPPED (`FIREBASE_ID_TOKEN` unset; no Auth bypass). Offline evidence from Legacy finance census: ~13 `countries` docs.

**Recommendation:** **CONDITIONAL GO** for operator-controlled Phase 4A-1 countries rerun after exporting a fresh ID token (verify `orderBy(naim)` + classification). **NO-GO** for Phase 4A-2 Cities. Expect possible `unmappedValid > 0` for `chad` / `niger` / `nigeria` until separately evidence-mapped (not aliases for the CP5 test country).

---

## 1. Repository query inspection (`listCountries`)

**File:** `src/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository.ts`

| Aspect | Before (buggy live window) | After (this verification) |
|--------|----------------------------|---------------------------|
| Collection | `countries` | `countries` (unchanged) |
| Filters / where | `[]` (none) | `[]` (none) |
| orderBy | **`name` asc** ← bug | **`naim` asc** (Legacy-aligned) |
| Pagination | `limit` ≤20; `startAfterCursor` | same |
| Field projection | none (full doc to mapper; envelope projects canonical fields only) | same |
| Active/inactive filter | none (`acctev` / `actev` not applied) | none |
| Tenant/country scoping | `intersectScopeOrThrow` then **post-map** filter on `scoped.countryIds` if present | same |
| Mapper before `recordsRead` | no — all returned docs counted | no — same; classification after read |

**Client:** `FirebaseAdminFirestoreReadClient.query` — allowlist-enforced; no select/projection; applies filters → orderBy → startAfter → limit.

**Fake client:** updated so `orderBy(field)` also **excludes docs missing that field** (mirrors Firestore semantics).

---

## 2. Legacy evidence (READ-ONLY) — where country lists load

### Authoritative collection

**Confirmed:** Firestore top-level collection `countries`  
Schema: `admin/Admi/lib/backend/schema/countries_record.dart` — primary name field **`naim`**, English **`naimEnglesh`**, active **`acctev`**, ISO **`iso_code`**. Admin create helper writes `naim`, **not** `name`.

### Old Admin

| Path | Behavior |
|------|----------|
| `admin/Admi/lib/components/list_dol_widget.dart` | `CountriesRecord.collection` + `orderBy('naim')` |
| `admin/Admi/lib/admin/admin_geo/admin_geo_hub_widget.dart` | `CountriesRecord.collection.orderBy('naim')` |
| `admin/Admi/lib/core/country/country_resolver.dart` | `queryCountriesRecordOnce(limit: 100)` then canonical Saudi merge |
| `admin/Admi/lib/backend/backend.dart` | `queryCountriesRecord*` → `CountriesRecord.collection` |
| Many pickers (`admin_add_agent`, `add_transport_company`, filter bars) | `queryCountriesRecordOnce` ± `orderBy('naim')` |

### Customer app (`ara_oatan_app`)

| Path | Behavior |
|------|----------|
| `lib/components/list_dol_widget.dart` | `where('acctev'==true).orderBy('num_trteb')` on `countries` |
| `lib/app/citie2/citie2_widget.dart` | `where('acctev'==true).orderBy('naim')`; ISO dedupe via `TouryCountryRegistry` |
| `lib/core/toury_country_registry.dart` | Alias / preferred doc IDs (SA→`saudi_arabia`, KG→`kyrgyzstan`, …) |
| `lib/core/toury_location_service.dart` / `toury_firestore_cache.dart` | Cache + `queryCountriesRecord*` |

### Driver app (`mndob-main`)

| Path | Behavior |
|------|----------|
| `lib/core/driver_country_service.dart` | `countries.where('acctev'==true)`; canonicalize via `TouryCountryRegistry` |
| `lib/core/driver_country_resolver.dart` | `countries.doc(id)` |
| Registration | Uses resolved country ref / requirements on `countries/{id}` (not a separate collection) |

### Cascade

Country → region (`dolh` → `countries/{id}`) → city is Legacy geo cascade; **not** a different country store. Phase 3 docs list `countries` among core collections (`docs/PHASE_3_REPORT.md`).

### Phase 3 / 3.5 / 3.7 assumption

Phase 3.7 `CountryCanonicalization` + TouryCountryRegistry evidence assumed collection `countries` with Legacy doc IDs/aliases. **Collection assumption was correct.** The live failure was **query orderBy field mismatch**, not a wrong collection.

---

## 3. Production countries-only safe inventory

### Live inventory this window

**SKIPPED**

| Check | Result |
|-------|--------|
| `FIREBASE_ID_TOKEN` in agent shell | **unset** |
| ADC (`gcloud auth application-default`) | available |
| Bypass invented? | **No** (per safety rules) |
| Production Firestore queries this window | **0** |
| Production writes | **0** |

### Offline / prior evidence (safe IDs only)

From Legacy finance census (`docs/admin_ui_recovery/FINANCE_F3C2D_DEPLOYMENT.md`, READ-ONLY):

- **Countries docs counted:** 13  
- **Obvious test:** `cp5_country_1787562918003`  
- **Plausible real (IDs only):** `saudi_arabia`, `kyrgyzstan`, `india`, `indonesia`, `malaysia`, `morocco`, `portugal`, `spain`, `tunisia`, `chad`, `niger`, `nigeria`  
- **Prior live window (operator context):** 1 doc visible under buggy `orderBy("name")` — the CP5 test fixture only

---

## 4. Investigate `cp5_country_1787562918003`

| Field (safe) | Value |
|--------------|-------|
| Document ID | `cp5_country_1787562918003` |
| Safe name | `FUNCTIONAL TEST COUNTRY` |
| Generator | Legacy **Checkpoint5 Admin AZ E2E** script |

**Evidence (Admin Next + Legacy search):**

- **Legacy create site:** `admin/ara_oatan_app/firebase/functions/scripts/checkpoint5_admin_az_e2e.js`  
  - `countryId = cp5_country_${stamp}`  
  - sets `naim`/`name` = `FUNCTIONAL TEST COUNTRY`  
  - `functional_test: true`, `functional_test_checkpoint: 'ADMIN_CP5'`, `iso2: 'ZZ'`  
  - soft-toggles `actev` (note: schema active flag is normally `acctev`)
- **Finance docs** list this ID among zero-agent countries (not deleted).
- **Admin Next:** no matches for `FUNCTIONAL TEST COUNTRY` / `cp5_country_` before this phase (not created by Admin Next).

**Verdict:** test / noncanonical fixture. **Do not delete. Do not alias.**

---

## 5. Root-cause classification

| Code | Applies? | Notes |
|------|----------|-------|
| **REPOSITORY_QUERY_FILTER_BUG** | **YES (primary)** | `orderBy("name")` vs Legacy `naim`; Firestore existence filter hid real countries |
| **INVALID_OR_TEST_COUNTRY_RECORD** | **YES** | CP5 FUNCTIONAL TEST COUNTRY |
| **AUTHORITATIVE_COLLECTION_CONFIRMED_TEST_RECORD_ONLY** | **PARTIAL** | Collection confirmed; “only test record in collection” is **false** (~13 docs offline); “only test record **returned by buggy query**” is true |
| WRONG_COUNTRY_COLLECTION | **NO** | |
| LEGACY_COUNTRY_SOURCE_DIFFERENT_THAN_PHASE3_ASSUMPTION | **NO** | Same `countries` collection |
| VALID_COUNTRIES_EXIST_BUT_MAPPER_FILTERS_THEM | **NO** for `recordsRead` | Mapper runs after query; did not reduce `recordsRead` |
| OTHER | — | Fake client previously did not mirror Firestore orderBy existence filter (fixed) |

---

## 6. Handling policy (implemented in Admin Next only)

### Design

- Deterministic `recordClassification`: `valid_candidate` | `test_or_noncanonical` | `malformed`
- Test fixtures **reported**, not silently dropped, **not** canonical-aliased
- Stats distinguish: `validMapped` | `unmappedValid` | `testOrNoncanonical` | `malformed` | `duplicates`
- Phase 4A-1 success gate (live harness):  
  `unmappedValid === 0` ∧ `duplicates === 0` ∧ `malformed === 0`  
  **`testOrNoncanonical` may be > 0** and is reported separately  
  **Did not** weaken to “allow arbitrary unmapped”

### Classification evidence for CP5

- Doc ID `/^cp5_country_\d+$/`
- and/or `functional_test === true` + `functional_test_checkpoint === 'ADMIN_CP5'`
- and/or `cp5_country_` prefix + display name `FUNCTIONAL TEST COUNTRY`

### Code changes (Admin Next only)

| File | Change |
|------|--------|
| `src/domain/geography/CountryRecordClassification.ts` | **new** classifier |
| `src/infrastructure/production/mappers/LegacyProductionMappers.ts` | classify before alias; no CP5 alias |
| `src/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository.ts` | `orderBy: naim`; expanded stats |
| `src/infrastructure/production/firestore/FakeFirestoreReadClient.ts` | orderBy ⇒ field must exist |
| `src/test/unit/country-record-classification.test.ts` | **new** |
| `src/test/unit/phase4a1-countries-gate.test.ts` | naim seeds + test/stats coverage |
| `src/test/live/phase4a1-live-countries.shadow.test.ts` | gate on `unmappedValid` (not blanket unmapped allow) |

**Legacy:** not modified.  
**Canonical table:** no row / alias for FUNCTIONAL TEST COUNTRY.

---

## 7. Safety

| Control | Status |
|---------|--------|
| Production read (committed `.env.local`) | **disabled** (`PRODUCTION_READ_ENABLED=false`, `LIVE_SHADOW_ALLOWED_RESOURCES=` empty) |
| All write flags | **false** |
| Collections accessed this window | **none** (inventory skipped) |
| Cities / users / order / drivers / agents / customers / payments / settlements / storage | **not accessed** |
| Mutation / deletion of CP5 doc | **none** |
| Tokens / raw full documents logged | **none** |

---

## 8. Tests

```
npm test       → PASS — 236 passed | 1 skipped (live harness gated)
npm run typecheck → PASS
npm run build  → PASS
```

**Did not** rerun full Phase 4A-1 live Countries success suite.

---

## Final deliverable checklist

```
TOURI TAXI ADMIN NEXT — PHASE 4A-1 COUNTRY SOURCE VERIFICATION REPORT

* authoritative legacy country source
  → Firestore collection `countries` (Admin/Customer/Driver all use it;
    Admin lists orderBy `naim`; Customer/Driver often filter `acctev==true`)

* exact Production collection/path
  → `countries` (document path `countries/{documentId}`)

* current repository query
  → collection `countries`, filters=[], orderBy `naim` asc, limit≤20,
    cursor startAfter, no active filter, no field projection,
    optional post-map countryIds scope

* number of countries visible
  → Live this window: SKIPPED (no token)
  → Offline Legacy census: ~13 docs
  → Prior buggy live query: 1 (CP5 test only)

* safe inventory
  → SKIPPED live; offline IDs listed in §3 (no raw docs)

* explanation of FUNCTIONAL TEST COUNTRY
  → Checkpoint5 Admin AZ E2E fixture (`checkpoint5_admin_az_e2e.js`)

* whether it is a test/noncanonical record
  → YES — classify as test_or_noncanonical; do not alias; do not delete

* root-cause classification
  → REPOSITORY_QUERY_FILTER_BUG + INVALID_OR_TEST_COUNTRY_RECORD
    (+ partial AUTHORITATIVE_COLLECTION_CONFIRMED for collection name)

* any code changes
  → Admin Next only: naim orderBy, classification, stats, Fake semantics, tests

* tests
  → npm test / typecheck / build PASS; live Countries not auto-rerun

* Production Firestore queries performed
  → 0 (this verification window)

* Production Firestore writes = 0

* final Production Read = disabled

* final Production Write = disabled

* recommendation GO / NO-GO for rerunning Phase 4A-1
  → CONDITIONAL GO for operator-controlled countries-only rerun
    (export FIREBASE_ID_TOKEN into harness shell; expect orderBy(naim)
     to surface real countries; CP5 counted as testOrNoncanonical;
     chad/niger/nigeria may still fail unmappedValid=0 until mapped
     with separate evidence — do NOT alias the test country).
  → NO-GO for Phase 4A-2 Cities.
```

---

## STOP

Phase 4A-2 Cities **not started**.

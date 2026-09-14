# TOURI TAXI ADMIN NEXT — PHASE 4A-2 CITIES READINESS REPORT

**Date:** 2026-09-11  
**Phase:** 4A-2 Cities Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Cities-only live shadow window  
(`PHASE4A2_LIVE_CITIES=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Cities query.**  
Production Read/Write remain **disabled** in local defaults (`.env.local`).

---

## 1. Authoritative Legacy city source (verified BEFORE design)

Admin, Customer, and Driver **agree** on one product-city SoT. No discrepancy → proceeded.

| App | Evidence | Collection | Role |
|---|---|---|---|
| **Admin** | `AdminGeoCascade`, `Adminvill` / geo hub, `admin_region_picker`, `add_vill` | `villages` | Product **city** |
| **Customer** | `list_vill_widget.dart` — `acctev==true`, `cities==regionRef`, `orderBy('naim')` | `villages` | Product **city** |
| **Driver** | `DriverRegLocationCascade` + `DriverLocationCatalogService.listCities` → `VillagesRecord` | `villages` | Product **city** |

Legacy cascade (Admin comment + scripts):

```
countries → cities (regions/cards) → villages (cities) → mkan (landmarks)
```

| Concept | Firestore collection | Notes |
|---|---|---|
| Country | `countries` | Phase 4A-1 |
| Region | `cities` | **Not** product cities |
| **City** | **`villages`** | **Authoritative for Phase 4A-2** |
| Landmark | `mkan` | Out of scope |

**Resource token** for live allowlist remains `cities` (product name).  
**Firestore collection** queried is `villages`.

---

## 2. Exact fields (Legacy evidence)

| Concern | Field | Evidence |
|---|---|---|
| **Country relation** | `dolh` (DocumentReference → `countries/{id}`) | `VillagesRecord.dolh`; Admin/Customer/Driver filters |
| **Region relation** | `cities` (DocumentReference → `cities/{id}` region) | `VillagesRecord.cities`; optional / nullable when missing |
| **Name** | `naim` (+ optional `names_i18n`) | Schema + all list UIs |
| **Active / status** | `acctev` (bool; default false if absent → treated `unknown` when missing) | Customer/Driver filter `acctev==true`; Admin toggle |
| **Ordering** | **`orderBy('naim')`** | Customer list; Admin geo hub load; Driver client sort by `naim` |
| **Not used for cities** | `sorting` | Exists on **regions** (`cities` collection), **not** on villages |
| **Not used** | English `name` / string `countryId` | Would repeat Phase 4A-1 `orderBy(name)` bug |

Indexes supporting common queries include `villages`: `acctev+naim`, `acctev+cities+naim`, `dolh+naim`.  
First live window uses **unfiltered** `orderBy(naim)` + limit ≤50 (single-field index).

---

## 3. Repository / query design

`FirebaseProductionGeographyReadRepository.listCities`:

- Kill switch + `LIVE_SHADOW_ALLOWED_RESOURCES` gate resource **`cities`**
- Query: `collection: "villages"`, `orderBy: naim asc`, hard cap **`PHASE_4A2_CITIES_MAX_PAGE = 50`**
- No Firestore `where(dolh==…)` in first window (would need Admin DocumentReference values); country scope applied **after** mapping to prevent cross-country leakage
- Country mappings from **code** (`CountryCanonicalization`) — **no** `listCountries` / countries Firestore query during cities live window
- Collection allowlist: added **`villages`** (kept `cities` for future regions)
- Deterministic cursor pagination via document id `startAfter`

---

## 4. Canonical City read contract

```
id, safeName, countryId, regionId|null, activeStatus|unknown,
mappingStatus, source="legacy_villages", warnings
(+ transitional name / aliasResolved / mappingVersion)
```

| `mappingStatus` | Rule |
|---|---|
| `validMapped` | `dolh` resolves via Phase 4A-1 country table |
| `unmappedCountry` | Missing/unknown `dolh` — **never invent from city name** |
| `ambiguousCountry` | Ambiguous city alias; country still from `dolh` only |
| `malformed` | Missing id / data |
| `testOrNoncanonical` | CP5 city id / `dolh→cp5_country_*` / functional_test markers — **never** aliased to production country |

Phase 4A-1 countries used for mapping:  
`saudi_arabia`, `kyrgyzstan`, `india`, `indonesia`, `malaysia`, `morocco`, `portugal`, `spain`, `tunisia`, `chad`, `niger`, `nigeria`.

---

## 5. Tests added

| File | Purpose |
|---|---|
| `src/test/unit/phase4a2-cities-readiness.test.ts` | Fake/unit: mapping, pagination, scope, gates, villages collection |
| `src/test/live/phase4a2-live-cities.shadow.test.ts` | Live harness gated by `PHASE4A2_LIVE_CITIES=1` (+ Node/env regressions always-on) |
| `src/domain/geography/CityRecordClassification.ts` | Classification + DocumentReference id extract |
| Updates | Startup allowlist cities\|countries; CollectionAllowlist; geo repo; mappers; Phase 4A-1 gate accepts cities-only |

### Test counts (this phase slice)

| Suite | Passed | Skipped |
|---|---|---|
| `phase4a2-cities-readiness.test.ts` | **21** | 0 |
| `phase4a2-live-cities.shadow.test.ts` (without live flag) | **3** | **1** (live `it`) |
| **Phase 4A-2 new tests** | **24** | **1** |

### Full suite gate

```
npm test && npm run typecheck && npm run build
→ PASS (264 passed | 2 skipped overall; live countries + cities live its skipped)
```

---

## 6. Production safety this session

| Metric | Value |
|---|---|
| **Production calls** | **0** |
| **Production writes** | **0** |
| Live cities query executed | **No** |
| Final `.env.local` | `PRODUCTION_READ_ENABLED=false`, `PRODUCTION_READ_MODE=disabled`, `LIVE_SHADOW_ALLOWED_RESOURCES=` empty, all write flags false |

---

## 7. Live harness design (operator later)

- Gate: `PHASE4A2_LIVE_CITIES=1` only  
- Env re-applied **inside** `it()` after global Vitest reset (`applyLiveCitiesEnvironment`)  
- `LIVE_SHADOW_ALLOWED_RESOURCES=cities` (exactly; not widened to countries)  
- Mutation trap + kill switch + `file_ndjson` sink under `.local/phase4a2-live/`  
- Safe report fields only: ids, safeNames, countryIds, mappingStatuses, stats  
- Stop conditions: unexpected collection ≠ `villages`, malformed > 0, write after kill, write trap fail  

### Operator command

```bash
PHASE4A2_LIVE_CITIES=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a2-live-cities.shadow.test.ts
```

(Requires Shadow SA ADC, project `tutorial-multi-language-70gx4j`, Node Vitest env.)

---

## 8. GO / NO-GO

| Decision | Status |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| Operator-controlled Cities live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Next resources (landmarks/trips/…) | **NO-GO / not started** |

**STOP here.** Do not execute live Production Cities query in this phase deliverable. Do not start landmarks/trips/drivers/agents/customers/payments/settlements/accounting/exports.

# TOURI TAXI ADMIN NEXT — PHASE 4A-3 LANDMARKS READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 4A-3 Landmarks Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Landmarks-only live shadow window  
(`PHASE4A3_LIVE_LANDMARKS=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Landmarks query.**  
Production Read/Write remain **disabled** in local defaults.

| Gate | Result |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| Operator-controlled Landmarks live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Trips / Drivers / Agents / Customers | **NO-GO / not started** |
| Production landmark create/edit/delete / Storage mutation | **NO-GO** |

**Landmarks readiness score: 88 / 100**

**Production calls = 0**  
**Production writes = 0**

---

## 1. Legacy source discovery (authoritative)

Admin, Customer, Driver, Functions, and geo_import **agree** on one landmark SoT. No discrepancy → proceeded.

| App / surface | Evidence | Collection | Role |
|---|---|---|---|
| **Admin** | `MkanRecord`, `adminadd_mkan_widget`, `AdminSaudiLandmarkLoader`, geo hub | `mkan` | CRUD landmarks |
| **Customer** | `toury_mkan_pagination`, `list_vi_widget`, `queryMkanRecord` | `mkan` | List / book landmarks |
| **Driver** | `mndob-main` `MkanRecord` (read subset on trip detail) | `mkan` | Display trip places |
| **Functions** | `mkan/{mkanId}` trigger, `mkan_list_visibility.js`, Africa geo compat shadows | `mkan` | Visibility / compat |
| **Scripts / seed** | `seed_production_landmarks.js`, `publish_*_landmarks.js`, geo_import `firestore_mapper.js` | `mkan` | Seed / patch |

Legacy cascade (unchanged from Phase 4A-2):

```
countries → cities (regions) → villages (product cities) → mkan (landmarks)
```

| Concept | Firestore collection | Notes |
|---|---|---|
| Country | `countries` | Phase 4A-1 |
| Region | `cities` | Not product cities |
| City | `villages` | Phase 4A-2 |
| **Landmark** | **`mkan`** | **Authoritative for Phase 4A-3** |

**Resource token** for live allowlist: `landmarks`.  
**Firestore collection** queried: `mkan`.

`mkan2` exists as a separate schema stub — **not** used as the product landmark SoT (no Admin/Customer list path).

---

## 2. Field schema (actually used)

| Concern | Field(s) | Type / relation | Evidence |
|---|---|---|---|
| Id | document id | string | `mkan/{id}` |
| Name | `naim` (+ `names_i18n`) | string / map | Schema + all list UIs |
| Description | `osf` (+ `osf_i18n`) | string / map | Admin create + Customer display |
| Content locale | `content_locale` | string | Admin add form |
| **Country** | **`Rev_dolh`** | DocumentReference → `countries/{id}` | Admin write; AdminSaudiLandmarkLoader; Customer Admin schema |
| **City** | **`id_vill`** | DocumentReference → `villages/{id}` | Customer pagination SoT filter |
| **Region** | **`id_cit`** | DocumentReference → `cities/{id}` | Admin create; optional |
| Coordinates | `Location` | GeoPoint / LatLng | Admin pin + Customer map |
| Address | `address` | string | Admin place picker / coords fallback |
| Images | `img1`, `img2`, `img3` (+ legacy `img`) | string URLs | Dual-read img→img1; Storage or http |
| Active | `acctev` | bool | Customer filter `acctev==true` |
| Sort / order | **`naim`** (list orderBy) | string | Customer `_pageQuery`; also `sr` int exists for import sort |
| Category | `tsnef`, `catgory`, flags `ismsgd`/`isfood`/`ishmam` | string / ref / bool | Admin chips; default `معالم سياحية` |
| Rating / hours | `rate`, `add_saat` | number | Admin form |
| Price-like | `ser` | number | Schema — **DO_NOT_EXPOSE** on read model |
| Ads / partner | `as_ads`, `ismzod`, `isShrek` | bool | Admin / import |
| Owner / reviewer | `user_malk`, `userRev`, `EmailUser` | ref / string | **Sensitive — not on read model** |
| PDF | `pdf`, `pdfKtab` | string | Customer schema — **not exposed** |
| Suggested | `IsSuggested`, `SuggestedPlaceCity` | bool / string | Customer schema |
| Timestamps | `dataAdd` | DateTime | Customer schema |
| Import compat | `geo_import_id`, `wikidata_id`, `country_iso`, license fields | various | geo_import only |

Relations are **DocumentReference** (or path/id Fake shapes). Never invent country/city from name or coordinates for identity (GPS boxes are **visibility** only — Functions `mkan_list_visibility` / AdminAppVisibilityLocation).

---

## 3. Country / city relationship

| Relation | Field | Target | Mapping reuse |
|---|---|---|---|
| Country | `Rev_dolh` | `countries/{id}` | Phase 4A-1 `resolveCanonicalCountryId` |
| City | `id_vill` | `villages/{id}` | Phase 4A-2 city id + optional `CityAliasResolver` |
| Region | `id_cit` | `cities/{id}` | Stored as `regionId` (nullable) |

Customer list SoT query:

```text
mkan.where(acctev==true).where(id_vill==villageRef).orderBy(naim)
```

Admin country lists often filter `Rev_dolh`. First Admin Next live window does **not** push Firestore `where` on refs (needs Admin DocumentReference values); scopes apply **after** mapping.

---

## 4. Image model

| Pattern | Legacy |
|---|---|
| Cover | `img1` (fallback `img` when empty) |
| Gallery | `img2`, `img3` |
| Values | Firebase Storage download URL, `https://`, or `commons://` |
| Upload | Admin `resolveImageForFirestoreSave` → URL string on doc |
| Customer display | `img1`/`img2`/`img3` on list cards |

**Canonical exposure:** `LandmarkImageSummary` only:

```ts
{ hasImage, imageCount: number|null, storageKind: firebase_storage|http_url|mixed|unknown }
```

Never expose signed URLs, credentials, or binary in envelopes.

---

## 5. Canonical domain model

`CanonicalLandmarkReadModel`:

- `id` / `canonicalLandmarkId` — document id (no silent merge)
- `sourceDocumentId` — always Firestore `mkan/{id}`
- `safeName`, `countryId`, `cityId`, `regionId|null`
- `activeStatus`: active|inactive|unknown (`acctev`)
- `coordinates`: `{latitude,longitude}|null`
- `imageSummary`
- `mappingStatus`: validMapped | unmappedCountry | unmappedCity | ambiguousCountry | ambiguousCity | malformed | testOrNoncanonical
- `source: "legacy_mkan"`

---

## 6. Duplicate / identity audit

Offline audit (`LandmarkDuplicateIdentityAudit`):

| Kind | Rule |
|---|---|
| Exact canonical | Same `canonicalLandmarkId`, distinct `sourceDocumentId` |
| Same landmark+city | Same canonical id + `cityId` |
| Semantic | Same `cityId` + normalized `safeName`; distinct canonical ids |
| Nearby coords | Evidence flag within 80m — **never auto-identity** |
| Activity | activeActive / activeInactive / inactiveInactive |

Metrics on `listLandmarks`:  
`recordsRead`, `validMapped`, `unmappedCountry`, `unmappedCity`, `ambiguousCountry`, `ambiguousCity`, `malformed`, `testOrNoncanonical`, `inactive`, `exactCanonicalDuplicates`, `semanticDuplicates`, `activeOperationalDuplicates`.

**Not safe for live close** if any of  
`unmappedCountry|unmappedCity|ambiguousCountry|ambiguousCity|malformed|activeOperationalDuplicates` > 0  
(unless documented Legacy evidence after operator live).

---

## 7. Test artifact classification

→ `testOrNoncanonical` (never delete):

- `cp5_mkan_*` / checkpoint / e2e id patterns
- `functional_test` + `ADMIN_CP5` / `FUNCTIONAL TEST` name
- `Rev_dolh` → `cp5_country_*` or `id_vill` → `cp5_city_*`
- `legacy_geo_shadow === true`
- geo_import source markers containing shadow/compat/e2e/checkpoint

---

## 8. Repository design

```
Presentation → Application → Domain → GeographyReadRepository.listLandmarks
  → FirebaseProductionGeographyReadRepository → FirestoreReadClient (Fake | Admin)
```

- No generic Firestore query from UI
- Resource gate token: `landmarks`
- Collection allowlist includes `mkan`
- Kill switch: `PRODUCTION_READ_ENABLED`
- Startup allowlist: exactly one of `countries` | `cities` | `landmarks`

---

## 9. Future Production query design (**DO NOT execute**)

```text
collection: mkan
filters: []                          # first window — no Rev_dolh/id_vill where
orderBy: naim asc                    # Legacy Customer list field
limit: min(request.limit, 50)        # PHASE_4A3_LANDMARKS_MAX_PAGE
startAfterCursor: document id
resource gate: landmarks
allowlist: mkan
NO listCountries / listCities during window (tables in code)
scope: post-map filter by countryId / cityId
```

Operator later may add `acctev==true` + `id_vill` once Admin refs are available — not required for readiness.

---

## 10. Sensitive fields registry

Added under resource `landmark` in `SensitiveFieldRegistry`:

| Field | Class | Notes |
|---|---|---|
| `EmailUser` | identity | DO_NOT_EXPOSE on read model |
| `user_malk`, `userRev` | identity | Owner/reviewer refs |
| `img1`,`img2`,`img3`,`img` | operational | Summary only |
| `ser` | financial | DO_NOT_EXPOSE_YET |
| `pdf`,`pdfKtab` | operational | DO_NOT_EXPOSE |

---

## 11. RBAC / scope

| Role pattern | Landmark scope |
|---|---|
| Global / auditor | All mapped (post-filter none) |
| Country | `countryId` ∈ scope (from `Rev_dolh`) |
| City | `cityId` ∈ scope (from `id_vill`) |
| Agent | Same geography intersect; no agent-owned landmark finance |

Permission used in tests: `geography:read` (operational). No landmark write permissions introduced.

---

## 12. Finance separation

- Landmark `ser` / refunds / settlements **out of** landmark read model
- Finance collections remain deny-listed
- No settlements/ledger coupling in Phase 4A-3

---

## 13. Write safety

| Flag | Required |
|---|---|
| `PRODUCTION_WRITE_ENABLED` | false |
| `GLOBAL_PRODUCTION_WRITE_ENABLED` | false |
| `FINANCE_WRITE_ENABLED` | false |
| `DRIVER_WRITE_ENABLED` | false |
| `AGENT_WRITE_ENABLED` | false |

Startup FAIL if any write flag true while Production Read enabled. Shadow mutation trap denies POST/PUT/PATCH/DELETE. No Storage mutation path in Admin Next for landmarks.

---

## 14. Offline tests

| File | Purpose |
|---|---|
| `src/test/unit/phase4a3-landmarks-readiness.test.ts` | Mapping, images, gates, pagination, scope, collection=`mkan`, kill switch, readiness gate |
| `src/test/unit/phase4a3-landmark-duplicate-identity.test.ts` | Exact/semantic/nearby/activity/CP5 exclusion |
| `src/test/live/phase4a3-live-landmarks.shadow.test.ts` | Always-on regressions + operator live `it` (skipped without flag) |

### Test counts (this phase slice)

| Suite | Passed | Skipped |
|---|---|---|
| `phase4a3-landmarks-readiness.test.ts` | **29** | 0 |
| `phase4a3-landmark-duplicate-identity.test.ts` | **8** | 0 |
| `phase4a3-live-landmarks.shadow.test.ts` | **4** (live body early-return without flag) | 0 marked skip* |
| **Phase 4A-3 new tests** | **41** | — |

\*Live Production path does not run unless `PHASE4A3_LIVE_LANDMARKS=1`.

### Full suite gate

```
npm test && npm run typecheck && npm run build
→ PASS (323 passed | 2 skipped overall; live countries + cities live its skipped)
```

---

## 15. Live harness prepare (SKIP by default)

File: `src/test/live/phase4a3-live-landmarks.shadow.test.ts`  
Gate: `PHASE4A3_LIVE_LANDMARKS=1` only. CI must not set it.

Designed flow (not executed this session):

1. Auth (verified token)  
2. Project fingerprint (`tutorial-multi-language-70gx4j`)  
3. Startup gate + `LIVE_SHADOW_ALLOWED_RESOURCES=landmarks`  
4. Bounded `mkan` query ≤50 orderBy `naim`  
5. Mapper + duplicate audit  
6. Post-map scope  
7. Write trap deny  
8. Kill switch deny  

### Operator command (future)

```bash
PHASE4A3_LIVE_LANDMARKS=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a3-live-landmarks.shadow.test.ts
```

Safe report path: `.local/phase4a3-live/landmarks-live-safe-report.json`  
(ids, safeNames, countryIds, cityIds, mappingStatuses, stats only — no image URLs / EmailUser)

---

## 16. Score deductions (/100)

| Score | 100 baseline |
|---|---|
| −8 | Live Production inventory unknown (operator window not run) |
| −2 | No Admin Next HTTP `/api/geography/landmarks` route yet (repo ready) |
| −2 | Historical docs may omit `Rev_dolh` (Admin now writes it; unmappedCountry gate) |
| **88** | **CONDITIONAL GO** |

---

## GO / NO-GO summary

```
TOURI TAXI ADMIN NEXT — PHASE 4A-3 LANDMARKS READINESS REPORT
Authoritative collection: mkan (resource token: landmarks)
Fake/unit + typecheck + build: PASS
CONDITIONAL GO for one future operator-controlled live Landmark read
Landmarks readiness score 88/100
Production calls = 0
Production writes = 0
STOP. No live executed. No Trips/Drivers/Agents/Customers.
```

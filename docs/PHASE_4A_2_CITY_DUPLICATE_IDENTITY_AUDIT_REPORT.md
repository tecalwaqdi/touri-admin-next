# TOURI TAXI ADMIN NEXT — PHASE 4A-2 CITY DUPLICATE IDENTITY AUDIT REPORT

**Date:** 2026-09-12  
**Project:** `tutorial-multi-language-70gx4j`  
**Codebase:** `/Users/ventura/touri-admin-next`  
**Legacy (READ-ONLY):** `/Users/ventura/ara-ban`  
**Live Production during this implementation:** **0 calls / 0 writes**

---

## Verdict

**CONDITIONAL GO** for **one operator-controlled** Phase 4A-2 live re-verification  
(`PHASE4A2_LIVE_CITIES=1`) with the new duplicate metrics + `sourceDocumentId` fields.

**NO-GO to close Phase 4A-2** until that live window reports  
`activeOperationalDuplicates === 0` (plus existing mapping gates).

Offline reconstruction from the prior live window  
(`.local/phase4a2-live/live-safe-summary.json`) predicts:

| Metric (reconstructed) | Value |
|---|---|
| exactCanonicalDuplicates | **8** groups |
| semanticDuplicates | **10** groups |
| activeOperationalDuplicates | **likely ≫ 0** (prior report lacked per-member `activeStatus`; many pairs look operational) |

Phase 4A-3 Landmarks: **NOT started**.

---

## 1. Why Phase 4A-2 must not close yet

Prior cities live window technically passed mapping gates:

| Prior live | Value |
|---|---|
| recordsRead | 47 |
| validMapped | 46 |
| testOrNoncanonical | 1 (CP5 FUNCTIONAL TEST VILLAGE) |
| unmapped/ambiguous/malformed | 0 |
| inactive | 9 |
| writes | 0 |
| mutation/kill | PASS |

But the report **omitted duplicate metrics**, and `safeIds` showed **canonical ID collisions** after alias remap (source document IDs were lost).

---

## 2. Code changes (this slice)

| Area | Change |
|---|---|
| `CanonicalCityReadModel` | Added `sourceDocumentId`, `canonicalCityId` (kept `id` = canonical) |
| `mapCityFromLegacyDoc` | Always emits both; alias remap never overwrites source doc id |
| `CityDuplicateIdentityAudit.ts` | Exact + semantic audit; activity classes; readiness helper |
| `FirebaseProductionGeographyReadRepository.listCities` | Runs audit; extends `CityMappingStats`; exposes `lastCityDuplicateAudit` |
| Live harness | Reports duplicate groups + readiness flag (still gated; not auto-run) |
| Tests | New `phase4a2-city-duplicate-identity.test.ts` |

### Mapping stats (extended)

```
exactCanonicalDuplicates
semanticDuplicates
activeOperationalDuplicates
```

### Live close gate (unchanged strictness; extended)

```
unmappedCountry === 0
∧ ambiguousCountry === 0
∧ malformed === 0
∧ activeOperationalDuplicates === 0
```

Historical **inactive+inactive** (and active+inactive) groups are **reported separately** and do **not** block the gate.

CP5 / `testOrNoncanonical` is **excluded** from operational duplicate counts.

---

## 3. Exact canonicalCityId duplicate groups

### Mechanism

Saudi hub aliases (`docs/legacy-mapping/legacy-city-aliases.json` ← `AdminGeoAliases.canonicalVillageId`) remap:

`city_riyadh` → `city_sa_riyadh`, `city_alkhobar`/`city_khobar` → `city_sa_khobar`, etc.

When **both** legacy and `city_sa_*` Firestore docs exist, the read model collapses to one `canonicalCityId` while `sourceDocumentId` stays distinct → **exact** collision.

### Reconstructed from prior live `safeIds` + Legacy alias/promote tables

| canonicalCityId | Count | Inferred sourceDocumentIds (Legacy evidence) | Region association (promote script) |
|---|---|---|---|
| `city_sa_abha` | 2 | `city_abha`, `city_sa_abha` | `region_sa_abha` |
| `city_sa_khobar` | **3** | `city_alkhobar`, `city_khobar`, `city_sa_khobar` | `region_sa_khobar` |
| `city_sa_dammam` | 2 | `city_dammam`, `city_sa_dammam` | `region_sa_dammam` |
| `city_sa_riyadh` | 2 | `city_riyadh`, `city_sa_riyadh` | `region_sa_riyadh` |
| `city_sa_taif` | 2 | `city_taif`, `city_sa_taif` | `region_sa_taif` |
| `city_sa_tabuk` | 2 | `city_tabuk`, `city_sa_tabuk` | `region_sa_tabuk` (CITY_CANON / publish scripts) |
| `city_sa_jeddah` | 2 | `city_jeddah`, `city_sa_jeddah` | `region_sa_jeddah` |
| `city_sa_makkah` | 2 | `city_makkah`, `city_sa_makkah` | `region_sa_makkah` |

**Active/inactive per member:** not in prior live report. Final live re-verification must emit `activeStatuses` per group (harness now does).

**Root cause class:** **Production Legacy data duplicated** (legacy + promoted `city_sa_*` docs both retained). Alias remap is **correct** per Legacy Admin/Customer remapping — not an invented wrong identity. Do **not** pick a silent winner.

Evidence:

- `promote_independent_sa_cities.js` — creates `villageId: city_sa_*` with `legacyVillageIds: ["city_*"]`, **no deletes**
- `audit_and_clean_geography.js` / `fix_curated_geo_visibility.js` — `CITY_CANON` maps legacy → `city_sa_*`
- `admin_production_seed_data.dart` — original seed IDs `city_riyadh`, `city_makkah`, …
- `AdminGeoAliases` / customer `touryCanonicalVillageRef` — remap refs at write/read time

---

## 4. Semantic duplicate groups

Same `countryId` + normalized `safeName` (+ `regionId` when present), **distinct** `canonicalCityId`s.

### From prior live pairs (visible distinct IDs)

| countryId | safeName | source / canonical IDs | Root cause |
|---|---|---|---|
| malaysia | Kuala Lumpur | `city_my_kuala_lumpur`, `city_sa_my_kuala_lumpur` | Intl legacy alias shadow (`AdminLegacyAliasFilter` `city_sa_{es\|ma\|pt\|tn\|id\|my\|in}_*`) |
| nigeria | أبوجا | `city_ng_abuja`, `city_sa_ng_abuja` | `legacy_africa_geo_compat.js` shadow `city_ng_*` → `city_sa_ng_*` |
| morocco | الرباط | `city_ma_rabat`, `city_sa_ma_rabat` | Intl alias shadow |
| tunisia | تونس | `city_tn_tunis`, `city_sa_tn_tunis` | Intl alias shadow |
| indonesia | جاكرتا | `city_id_jakarta`, `city_sa_id_jakarta` | Intl alias shadow |
| portugal | لشبونة | `city_pt_lisbon`, `city_sa_pt_lisbon` | Intl alias shadow |
| spain | مدريد | `city_es_madrid`, `city_sa_es_madrid` | Intl alias shadow |
| chad | نجامينا | `city_td_ndjamena`, `city_sa_td_ndjamena` | Africa compat shadow |
| niger | نيامي | `city_ne_niamey`, `city_sa_ne_niamey` | Africa compat shadow |
| india | نيودلهي | `city_in_new_delhi`, `city_sa_in_new_delhi` | Intl alias shadow |

**Not** distinct regional cities: same country + same display name; shadows exist so **old clients** can resolve remapped `region_sa_{iso}_*` / village paths. Admin UI already hides intl alias docs via `AdminLegacyAliasFilter` (Africa `ng|td|ne` handled by compat layer separately).

**Canonicalization:** intl originals keep `city_{iso}_*` identity; shadows keep `city_sa_{iso}_*` identity (no auto-merge — ban honored). Classify as **semantic duplicates**, retain both sources in diagnostics.

---

## 5. Legacy why / how apps use identity

| Topic | Finding |
|---|---|
| Admin create (`add_vill`) | `VillagesRecord.collection.doc()` — **auto-generated** IDs (not slug) |
| Seeds / promote / geo scripts | **User-defined** slug IDs (`city_*` / `city_sa_*`) |
| Duplicate prevention | Soft-disable scripts exist; **no hard unique constraint** on name; Admin country has uniqueness copy, cities do not equivalently |
| Customer / Driver / Admin lists | Filter/select by **DocumentReference** + `acctev` / region parent — **not** city name as identity |
| Alias remap | Write-path remaps legacy hub refs → `city_sa_*` so landmarks appear; does **not** delete old village docs |

---

## 6. Canonicalization vs Production data

| Case | Verdict |
|---|---|
| Saudi hub `city_*` + `city_sa_*` | **Data duplicated** in Production; alias collapse is Legacy-correct → exact collision after map |
| Intl / Africa `city_{iso}_*` + `city_sa_{iso}_*` | **Data duplicated** (compat shadows); **not** wrong name→country invent; semantic duplicates |
| Same name, different countries | **Not** duplicates (tests assert) |
| Same name/country, **different proven regionIds** | **Not** semantic duplicates (region in key) |
| Name-only as canonical id | **Never** — country from `dolh` only |

No silent dedupe / winner selection in this phase.

---

## 7. Tests

| Suite | Result |
|---|---|
| `phase4a2-city-duplicate-identity.test.ts` | **14 passed** |
| `phase4a2-cities-readiness.test.ts` | **21 passed** (sourceDocumentId assertions added) |
| Full `npm test` | **281 passed \| 2 skipped** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Covered: two sources → same canonical; cross-country same name; distinct regions; active/inactive classes; active+active blocks readiness; CP5 excluded; `sourceDocumentId ≠ canonicalCityId` after remap.

---

## 8. Production safety (this implementation)

| Metric | Value |
|---|---|
| Production calls | **0** |
| Production writes | **0** |
| Final Read | **disabled** (`.env.local` `PRODUCTION_READ_ENABLED=false`) |
| Final Write | **disabled** |
| Live auto-run | **No** |

---

## 9. GO / NO-GO

| Decision | Status |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| One final Phase 4A-2 live verification (operator, cities-only, ≤50) | **CONDITIONAL GO** — required to fill source IDs + activity classes |
| Close Phase 4A-2 after prior live alone | **NO-GO** — duplicates metric missing; reconstructed active operational duplicates |
| Phase 4A-3 Landmarks | **NO-GO / not started** |

### Operator live command (manual only)

```bash
PHASE4A2_LIVE_CITIES=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a2-live-cities.shadow.test.ts
```

Expect report fields: `exactCanonicalDuplicates`, `semanticDuplicates`, `activeOperationalDuplicates`,
`exactCanonicalIdDuplicateGroups`, `semanticDuplicateGroups`, `sourceDocumentIds`, `citiesReadyForClose`.

Close only when `citiesReadyForClose === true`  
(`activeOperationalDuplicates === 0` and mapping gates clear). Inactive historical duplicates may remain reported.

---

**STOP.** Do not start Phase 4A-3 Landmarks.

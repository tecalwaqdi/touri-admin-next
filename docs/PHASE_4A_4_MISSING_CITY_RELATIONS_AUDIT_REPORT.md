# TOURI TAXI ADMIN NEXT — PHASE 4A-4 MISSING CITY RELATIONS AUDIT REPORT

**Date:** 2026-09-12  
**Project:** `/Users/ventura/touri-admin-next`  
**Legacy:** `/Users/ventura/ara-ban` (READ-ONLY)  
**Live Production during this audit:** **0 calls / 0 writes**  
**Prior live window (operator):** `recordsRead=14`, `validMapped=7`, `unmappedCity=7`, `unmappedCountry=0`, writes=0, kill switch PASS  

---

## Verdict

**CONDITIONAL GO** for **one final operator-controlled Trips live verification** (diagnostics now ready to emit per-trip safe IDs).  

**NO-GO for Phase 4A-4 closure** until that live confirms the 7 blockers and (optionally) operator decides whether to adopt the documented `legitimate_not_represented` closing-gate policy.

**Drivers / Phase 4A-5:** not started.  
**Bounded-latest fallback:** not used.  
**N+1 mkan fetches:** not implemented.  
**Financial rates:** not recalculated.

---

## 1. Production order IDs — unavailable in repo

`.local/phase4a4-live/live-safe-summary.json` and `observability.ndjson` contain **aggregates only**:

- Exactly **7** `missing_city_relation` warning events  
- **No** `sourceDocumentId` list was persisted in prior live summary  

**7 affected source order IDs:** **not reconstructible without inventing Production IDs.**  

Harness now writes `tripGeographyDiagnostics[]` (safe IDs + vill case + paths) on the next operator live. Fake cohort `fake_miss_0..6` / `fake_ok_0..6` proves the diagnostic path offline.

---

## 2. Safe per-trip `TripGeographyDiagnostic`

Implemented: `src/domain/trip/TripGeographyDiagnostic.ts`

| Field | Content |
|---|---|
| `sourceDocumentId` | Firestore order id |
| `sourceCountryPath` / `sourceCountryDocumentId` | From `Rev_dolh` only |
| `sourceCityPath` / `sourceCityDocumentId` | From `vill` only |
| Landmark paths | Pickup/destination `Revmkan` / `mkan_rev` paths + stop count |
| `countryMapping` / `cityMapping` | Independent assessment |
| `lifecycleStatus` | From mapper |
| `cityEvidenceKind` | `direct_vill` \| `legacy_alias` \| `landmark_relation` \| `other_proven_legacy` \| `none` |
| `villPresenceCase` | Exact presence classification |
| `cityKnowledge` | `known` \| `missing` \| `not_represented` \| `unknown` |
| `proposedClosingBucket` | Diagnostic only (does not weaken live close yet) |
| `schemaPattern` | Non-sensitive structure fingerprint |

**No PII:** no phones, emails, addresses, chat, coords, payment credentials, raw payloads, tokens.

---

## 3. Why `vill` missing — exact case taxonomy

Mapper emits `missing_city_relation` when `extractLegacyDocRefId(order.vill)` is null.

| Case | Meaning | Live 7 (status) |
|---|---|---|
| `absent_key` | Key omitted (CF null-delete / client `if (villnow != null)`) | **Likely majority — unconfirmed per-ID until next live** |
| `null` | Explicit null (payment-api can write `vill: null`) | Possible |
| `empty_string` | `""` | Unlikely on Production writers |
| `wrong_type` | number/boolean | Unlikely |
| `unextractable_ref_shape` | Object without id/path | Unlikely |
| `different_alias_only` | `cityId` / `id_vill` / `Rev_vill` without `vill` | **No Legacy order writer proven** |
| `region_ref_cities_user_now_only` | Region `cities/{id}` only | Possible companion to absent vill |
| `display_text_only` | `vill_text` string only | Possible (Admin display uses text) |
| `present_document_ref` / `present_path_string` | Mapped path | The other **7/14** |

**Do not claim all 7 are the same without per-doc evidence.** Next live populates `villPresenceCounts` + per-id diagnostics.

Fake offline mirror (7 absent_key + 7 present_document_ref) reproduces the aggregate gap.

---

## 4. Deep Legacy schema audit — city fields on `order`

### Evidence matrix

| Legacy path | Order writer | City field written | Type | Required? | Period / notes |
|---|---|---|---|---|---|
| `createCashBooking` CF (`ngenius_payments.js`) | Functions | `vill: villageRef` from `booking.villagePath` via `optionalDocumentReference` | DocumentReference \| omitted | **Optional** — null keys deleted before create | Current cash path |
| `finalizeNGeniusBooking` CF | Functions | same `vill: villageRef` | DocumentReference \| omitted | **Optional** — null delete | Current online finalize |
| `payment-api` `build-order.ts` | External API | `vill: draft.villagePath ? doc : null` | DocumentReference \| null | **Optional** | `backend_source: external_api` |
| Customer cash Firestore fallback (`toury_booking_service.dart`) | Client | `if (app.villnow != null) 'vill': app.villnow` | DocumentReference when present | **Optional** — key omitted if null | `created_by_client_cash_fallback: true` |
| FlutterFlow `createOrderRecordData` (Admin/Customer/Driver schemas) | Helper | `'vill': vill` inside `.withoutNulls` | DocumentReference? | **Optional** (`hasVill()`) | Schema long-standing |
| Admin bookings list | Reader | filters `where('vill', …)` when city filter set | — | Filter optional | Ops prefers vill |
| Driver match (`driver_order_match.dart`) | Reader | uses `order.vill` when present | — | Preferred for match | Not a create writer |
| Admin display adapters | Reader | **`vill_text` string** for display city label | string | Display fallback | **Not** DocumentReference SoT |

### Legacy city field aliases on orders

| Field | Role | Use for Canonical city? |
|---|---|---|
| **`vill`** | Product city → `villages/{id}` | **Yes — sole SoT** |
| `vill_text` | Display label | **No** (never invent) |
| `cities_user_now` | Region → `cities/{id}` | **No** (region, not city) |
| `listAmakn[].textivill` | Stop display city string | **No** |
| `listAmakn[].Revmkan` | Landmark ref → `mkan/{id}` | Landmark only; city requires mkan fetch |
| `cityId` / `city_id` / `id_vill` / `Rev_vill` / `villageId` on **order** | — | **Not found on order writers/schemas** |

### Was `order.vill` always required?

**No.** Schema is `DocumentReference?` with `hasVill()`. All inspected create paths treat village as optional and omit/null it when `villagePath` / `villnow` absent. So **historically optional at write time**, while Admin/Driver **prefer** it when present.

---

## 5. `listAmakn` / landmark → city

| Question | Finding |
|---|---|
| Does stop embed city DocumentReference? | **No** — `AmaknCostmStruct` has `Revmkan`, `textivill` (string), not `id_vill` |
| Does any order mapper resolve city via `mkan.id_vill`? | **No proven Admin Next or Legacy order-read path** for trip city |
| Is landmark→city authoritative for trips? | **NOT PROVEN** — do not implement |
| If later reviewed | Prefer: (A) source `order.vill` evidence, (B) explicit code maps, (C) bounded/preloaded mkan strategy — **never silent N+1** (`firestoreQueries` must stay 1 unless separately approved) |

`cityEvidenceKind: landmark_relation` remains unused (counter always 0 by design).

---

## 6–8. Mapping policy (no invent / no N+1)

- City from `vill` only (mapper corrected: removed unsafe `cities_user_now` / speculative `cityId` fallbacks).  
- Never derive from country, coords, names, `vill_text`, landmark names.  
- `cityKnowledge=not_represented` only when Legacy optional-write evidence applies **and** vill relation absent (`absent_key` / `null` / region-or-text-only).  
- Live closing gate **still** requires `unmappedCity === 0` (not weakened).

---

## 9. Schema / version pattern (7 vs 7) — Fake + expected live

Non-sensitive fingerprint (`schemaPattern`) compares:

`villPresent`, `Rev_dolh`, `listAmakn` / landmark count, `status_code`, payment method class, `data_order`, `trip_type`, writer hints (`created_by_function` / client cash fallback / external_api), presence of financial amount fields.

**Offline Fake 14-doc cohort:** cohorts differ **primarily on `villPresent`**; country, landmarks, status, payment, `data_order` align.  

**Live 7 IDs:** fill on next operator run via `tripGeographyDiagnostics` + `summarizeSchemaPatternCohorts` (no customer/driver identities).

---

## 10. `financial_safe_read_warning` vs `financialUnknown=0`

### What happened on live

Observability showed **~28** financial warnings + **7** `missing_city_relation` on 14 trips.

Cause: every order emits rate warnings because **VAT % / platform commission % are not snapshotted on order** → knowledge `not_represented`. Amounts (`total_app` / `total_vat` / `total_mndob` / `total_mndob2`) were fine → **`financialUnknown=0`**, **`financialConflicting=0`** are correct.

### Counter redesign (implemented)

| Counter | Meaning |
|---|---|
| `financialPersistedComplete` | Amounts persisted \| known_zero \| missing (no unknown/conflict/derived) |
| `financialAmountUnknown` | Any amount knowledge `unknown` |
| `financialRateUnknown` | Rate field present but unparseable |
| `financialNotRepresented` | Rate(s) absent / not snapshotted (**expected**) |
| `financialDerived` | Any derived money (should stay 0 — we never recompute) |
| `financialConflicting` | Still blocks close |
| `financialUnknown` | Legacy aggregate (amount or rate `unknown`) — rates `not_represented` **do not** inflate this |

### Precise warning codes (not suppressed)

- `vat_rate_not_snapshotted`  
- `platform_commission_rate_not_snapshotted`  
- `currency_not_represented_on_order`  
- `financial_amount_unknown` / `financial_amount_conflicting`  
- Generic `financial_safe_read_warning` retained only for residual messages  

---

## 11. Closing-gate policy

### Current (unchanged — still blocks)

`unmappedCity === 0` required for live close. Prior window → **NO-GO**.

### Documented future buckets (diagnostic `proposedClosingBucket`)

| Bucket | Blocks close? (proposed) |
|---|---|
| `mapped` | No |
| `legitimate_not_represented` | No — only after operator accepts Legacy optional-vill evidence |
| `testOrNoncanonical` | No (separate tally) |
| `unmapped` | **Yes** |
| `malformed` | **Yes** |

Helper `tripCityClosingBucketsAllowClose` exists but is **not wired** to `tripMappingReadyForLiveClose`. Gate change requires explicit operator decision after next live confirms presence cases.

---

## 12. Harness diagnostics

On next `PHASE4A4_LIVE_TRIPS=1` run, `live-safe-summary.json` includes:

- `tripGeographyDiagnostics` for blocking / not_represented records  
- Counters: `directCityMapped`, `legacyAliasCityMapped`, `landmarkEvidenceCityMapped`, `cityNotRepresented`, `cityMissingUnresolved`  
- Split financial counters  

Still: one `order` query, no mkan/user/villages N+1, kill switch, writes=0.

---

## 13. Code changes

| Change | Path |
|---|---|
| Geography diagnostic + counters + schema fingerprint | `src/domain/trip/TripGeographyDiagnostic.ts` |
| City extract = `vill` only (no region invent) | `src/domain/trip/mapCanonicalTripRead.ts` |
| Precise financial warning codes | `mapCanonicalTripRead.ts` + `TripFinancialSafeRead.ts` |
| Split financial audit metrics | `TripDuplicateIdentityAudit.ts` |
| Repo emits diagnostics + counters | `FirebaseProductionTripReadRepository.ts` |
| Live harness summary fields | `phase4a4-live-trips.shadow.test.ts` |
| Offline audit suite | `phase4a4-missing-city-relations-audit.test.ts` |

---

## 14. Tests / verify

```text
npm test       → 400 passed | 2 skipped (402) — 42 files
npm run typecheck → PASS
npm run build     → PASS
Production calls  → 0
Production writes → 0
```

Coverage includes: vill presence cases, no invent from landmark/region/text, diagnostic fields, 7/14 Fake cohort, financial warning vs unknown split, live gate still blocks `unmappedCity>0`, proposed future gate helper, firestoreQueries=1.

---

## Root-cause classification (all 7)

**Working classification pending per-ID live:**  
**Primary hypothesis (Legacy-proven):** optional write omission / null-delete of `order.vill` → relation absent while country + landmarks may still exist → `missing_city_relation` / `unmappedCity`.

**Not root cause:** country mapping, status mapping, financial amount unknown, kill switch, query type mismatch (already fixed).

**Not authorized fixes:** inventing city from landmark/`vill_text`/region; N+1 mkan; weakening close without operator policy flip.

---

## GO / CONDITIONAL GO / NO-GO

| Decision | Status |
|---|---|
| Phase 4A-4 closure now | **NO-GO** (`unmappedCity=7`) |
| One final Trips live verification (operator) | **CONDITIONAL GO** — diagnostics ready; no auto-run |
| Adopt `legitimate_not_represented` close policy | **CONDITIONAL** — after live confirms cases |
| Drivers / 4A-5 | **NO-GO / not started** |
| Production auto | **NO** |

```
TOURI TAXI ADMIN NEXT — PHASE 4A-4 MISSING CITY RELATIONS AUDIT REPORT

7 affected source order IDs (safe IDs only)
  → UNAVAILABLE in .local summaries (aggregates only). Next live populates tripGeographyDiagnostics[].

for each: vill presence/type, country relation, landmark refs, lifecycle, exact mapping classification
  → Harness + Fake diagnostics ready; live per-ID pending operator run.

Legacy order writers discovered
  → createCashBooking, finalizeNGeniusBooking, payment-api build-order, client cash fallback, FlutterFlow createOrderRecordData.

Legacy city field aliases
  → SoT: vill → villages/{id}. Display: vill_text. Region: cities_user_now. Stops: textivill string + Revmkan. No order cityId/id_vill writers found.

whether vill was historically optional
  → YES (DocumentReference?; all create paths optional omit/null-delete).

whether landmark→city is authoritative
  → NOT PROVEN — do not implement; would need reviewed non-N+1 strategy.

whether any trip type legitimately has no city
  → Write path can legitimately omit city relation; display may use vill_text. Canonical mapping must not invent. Diagnostic cityKnowledge=not_represented candidate; live gate still blocks.

root cause classification for all 7
  → Likely optional vill omission (exact case counts pending live IDs). Not all claimed identical without evidence.

financial_safe_read_warning explanation
  → Rate fields not_represented (expected) → warnings; amounts OK → financialUnknown=0 / financialConflicting=0.

financial counter redesign if needed
  → Added financialPersistedComplete, financialAmountUnknown, financialRateUnknown, financialNotRepresented, financialDerived + precise warning codes.

code changes
  → TripGeographyDiagnostic, mapper vill-only, financial codes/counters, repo+harness wiring, audit tests.

tests added
  → phase4a4-missing-city-relations-audit.test.ts (15) + readiness/harness updates.

full test count
  → 400 passed | 2 skipped (402) — 42 files

typecheck
  → PASS

build
  → PASS

Production calls = 0
Production writes = 0
GO / CONDITIONAL GO / NO-GO for ONE final Trips live verification
  → CONDITIONAL GO (operator only; closure still NO-GO until live + policy)
```

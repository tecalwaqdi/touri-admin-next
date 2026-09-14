# TOURI TAXI ADMIN NEXT — PHASE 4A-4 FINAL CITY NOT-REPRESENTED POLICY REPORT

**Date:** 2026-09-12  
**Scope:** Trips city knowledge final policy (offline + gate). No Production auto-run. Drivers not started.

---

## 1. Policy applied

When authoritative Legacy city field `vill` is genuinely absent (`villPresenceCase=absent_key` or optional-null / display-text-only / region-hint-only) **and** there is no malformed city ref **and** no proven alternate Legacy city ref via `vill`:

| Decision | Value |
|---|---|
| `cityKnowledge` | `not_represented` |
| `cityMapping` | `not_represented` |
| `proposedClosingBucket` | `legitimate_not_represented` |
| `cityId` | `null` (never invent) |
| `sourceCityPath` | `null` |
| Audit `unmappedCity` | **does not increment** |
| Closing gate | **does not fail** on `cityNotRepresented > 0` |

**Not** `unmappedCity`, **not** `malformed`. Do not invent canonical city from `vill_text`, country, coords, landmarks, or order ID naming. Do not invent Makkah/Jeddah. Do not classify `demo_fin_trip_*` as `testOrNoncanonical` from `demo_` prefix alone (no Legacy seed/test evidence).

### City states (closing-relevant)

| State | Meaning | Blocks close? |
|---|---|---|
| `mapped` | Valid `vill` → `villages/{id}` | No |
| `not_represented` | `vill` absent/null per optional Legacy schema | **No** |
| `unmapped` | Source city identity exists but cannot map | **Yes** |
| `malformed` | Field exists with invalid shape | **Yes** |

Financial policy unchanged: `financialNotRepresented` for missing rate snapshots remains non-zero; rates are not reconstructed.

---

## 2. Mapper change

**File:** `src/domain/trip/mapCanonicalTripRead.ts`

When country resolves and `extractLegacyDocRefId(order.vill)` is null, classify via `classifyVillPresence(data)`:

| `villPresenceCase` | `mappingStatus` | Warning |
|---|---|---|
| `absent_key` / `null` / `display_text_only` / `region_ref_cities_user_now_only` | `validMapped` (cityId null) | `city_not_represented` (info) |
| `wrong_type` / `unextractable_ref_shape` / `empty_string` | `malformed` | `malformed_city_relation` |
| `different_alias_only` (and residual) | `unmappedCity` | `missing_city_relation` |

Still never maps `vill_text`, `cities_user_now`, landmarks, country, or coords into `cityId`.

**Diagnostic:** `src/domain/trip/TripGeographyDiagnostic.ts` — `cityMapping` final value is `not_represented` (was `not_represented_candidate`).

---

## 3. Closing-gate change

**File:** `src/domain/trip/TripDuplicateIdentityAudit.ts` — `tripMappingReadyForLiveClose(metrics, geography?)`

- `cityNotRepresented > 0` → **does not fail**
- Still requires: `recordsRead > 0`, `unmappedCountry=0`, `unmappedCity=0`, `malformed=0`, `unknownLifecycleStatus=0`, `conflictingLifecycleStatus=0`, `financialConflicting=0`, `activeOperationalDuplicates=0`, plus existing ambiguous/unmappedStatus zeros
- New optional geography arg: `cityMissingUnresolved > 0` → **fails**
- Live harness passes `page.geographyCounters`

Expected Fake/live sample after reclassification:

| Metric | Expected |
|---|---|
| `directCityMapped` | 7 |
| `cityNotRepresented` | 7 |
| `cityMissingUnresolved` | 0 |
| `unmappedCity` | 0 |

---

## 4. Tests added / updated

**File:** `src/test/unit/phase4a4-missing-city-relations-audit.test.ts`

- `absent_key` → `not_represented` / `validMapped`
- Valid `vill` → `mapped` / `directCityMapped`
- Invalid vill shape → `malformed` blocks
- Alias-only → `unmappedCity` blocks
- Absent + `vill_text` → still `not_represented`
- Absent + region / landmark name → no inference
- Gate: `cityNotRepresented` allowed; `cityMissingUnresolved` / `unmappedCity` block
- Fake 7+7 cohort: `unmappedCity=0`, gate ready

**File:** `src/test/unit/phase4a4-trips-readiness.test.ts`

- Absent vill mapper expectation updated
- `unknownLifecycleStatus` blocks; `cityNotRepresented` does not

Live harness wired to pass geography counters into the gate (no auto live).

---

## 5. Verify (offline)

```text
npm test       → 403 passed | 2 skipped (405) — 42 files
npm run typecheck → PASS
npm run build     → PASS
Production calls  → 0
Production writes → 0
```

No auto live. Drivers not started.

---

## 6. GO / CONDITIONAL GO / NO-GO

| Decision | Status |
|---|---|
| Final city not-represented policy | **APPLIED** |
| One final Trips live verification (operator) | **CONDITIONAL GO** |
| Drivers / 4A-5 | **NO-GO / not started** |
| Production auto | **NO** |

```
TOURI TAXI ADMIN NEXT — PHASE 4A-4 FINAL CITY NOT-REPRESENTED POLICY REPORT

policy applied
mapper change
closing-gate change
tests added
full test count
typecheck
build
Production calls = 0
Production writes = 0
CONDITIONAL GO for ONE final Trips live verification
```

STOP. Do NOT start Drivers automatically.

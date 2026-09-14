# TOURI TAXI ADMIN NEXT — PHASE 4A-4 ZERO-RESULT LIVE TRIPS AUDIT REPORT

**Date:** 2026-09-12  
**Project:** `/Users/ventura/touri-admin-next`  
**Legacy:** `/Users/ventura/ara-ban` (READ-ONLY)  
**Production live during this audit:** **0 calls / 0 writes**  
**Closure status:** **NO-GO** until one final operator Trips live verification with `recordsRead > 0`

---

## 1. Exact previous query (first operator live window)

From harness + `FirebaseProductionTripReadRepository.list` (pre-fix) + `.local/phase4a4-live/live-safe-summary.json`:

| Parameter | Value |
|---|---|
| collection | `order` |
| where | `data_order >= createdFromUtc` **AND** `data_order <= createdToUtc` |
| timestamp field | `data_order` |
| window start | ~`2026-09-05T00:46:11.557Z` (default **7 days** before `now`) |
| window end | ~`2026-09-12T00:46:11.557Z` (`now` at read; obs `at=2026-09-12T00:46:11.557Z`) |
| orderBy | `data_order` |
| direction | `desc` |
| limit | `50` (`PHASE_4A4_TRIPS_MAX_PAGE`) |
| cursor | none (`startAfterCursor` unset) |
| firestoreQueries | **1** |
| filter bound **type** (BUG) | **ISO string** (`window.createdFromUtc` / `createdToUtc` from `resolveTripDateWindow`) |

Harness called:

```ts
trips.list(ctx, {}, { limit: 50 });
```

so the repository applied the default 7-day window with **no** country/city/status filters (scope post-map only).

### Live summary observed (incorrect PASS)

```text
overallStatus = PASS
collectionQueried = order
firestoreQueries = 1
recordsRead = 0
mappingReadyForLiveClose = true   ← WRONG
observability = production_read_request only (no kill_switch_triggered)
```

---

## 2. `data_order` proven Legacy type

| Surface | Evidence | Type |
|---|---|---|
| Customer schema | `ara_oatan_app/.../order_record.dart` — `DateTime? _dataOrder`; cast `as DateTime?` | Firestore **Timestamp** (Flutter `DateTime`) |
| Driver schema | `mndob-main/.../order_record.dart` — same | Timestamp / DateTime |
| Admin schema | `Admi/.../order_record.dart` — same | Timestamp / DateTime |
| Customer write | `toury_booking_service.dart` — `'data_order': now` (`DateTime`) | Timestamp |
| Functions write | `ngenius_payments.js` — `data_order: now` / Timestamp | Timestamp / Date |
| Admin list query | `admin_bookings_query.dart` — `Timestamp.fromDate(...)` range + `orderBy('data_order', descending: true)` | **Timestamp bounds** |
| Functions list | `functions/index.js` — `where("data_order", ">=", periodStart)` with `new Date(periodStart)` | **Date → Timestamp** |
| Tests / fixtures | Timestamp.fromDate, `new Date(...)`, `DateTime(...)` | Timestamp family |

**Conclusion:** `order.data_order` is a **Firestore Timestamp** (FlutterFlow `DateTime`), consistently written on create paths inspected.  
**Not** an ISO string, epoch int, or display string as the Production field type.  
Docs/tests may use ISO strings in Fake seeds; Production stores Timestamp.

`orderBy("data_order")` also **excludes documents missing** `data_order` (Firestore field-existence rule) — secondary factor only; not the primary zero-result cause for a 7-day live window with active booking traffic expected.

---

## 3. Why `recordsRead = 0` — classification

**Primary class: E — type mismatch**

Evidence:

1. Repository passed **ISO strings** into `where("data_order", ">=|<=", isoString)`.
2. Legacy / Admin / Functions always compare with **Date/Timestamp**.
3. Firestore type order: Timestamp < String. Timestamp field values never satisfy `>=` / `<=` against string bounds → empty page.
4. Fake regression reproduces: Timestamp-like docs + ISO string bounds → **0 docs**; same docs + `Date` bounds → matches.
5. Live evidence consistent: 1 successful `order` query, `recordsRead=0`, no query error (not an index failure).

| Class | Applicable? |
|---|---|
| A. no orders in window | Possible secondary *after* type fix; **not** proven as primary |
| B. wrong date bounds | Unlikely — default 7d from `now` is intentional |
| C. timezone bug | Not indicated; ISO UTC window construction is consistent |
| D. wrong timestamp field | **No** — `data_order` is the proven list field |
| **E. type mismatch** | **YES — root cause** |
| F. orderBy excludes missing `data_order` | Contributing pattern in general; not sufficient to explain this PASS-with-zero alone |
| G. index | Query succeeded (1 read request); no FAILED_PRECONDITION observed |
| H. other | Closing-gate bug allowed PASS on empty page (separate defect) |

---

## 4. Query correction

**Required:** convert window ISO strings to `Date` before Firestore filters (Admin SDK serializes as Timestamp), matching Legacy Admin `Timestamp.fromDate` / Functions `new Date()`.

Implemented in `FirebaseProductionTripReadRepository`:

- `tripWindowBoundToFirestoreDate(iso)` → `Date`
- filters use `Date` bounds (`queryFilterBoundType: "Date"`)
- `queryMeta` exposes window / field / direction / limit / mode

**Not changed:** collection `order`, field `data_order`, default 7d / max 31d, limit ≤50, no auto-pagination, no N+1.

---

## 5. Bounded fallback design (still one page)

If a corrected date window is **legitimately** empty:

| Option | Design | Status |
|---|---|---|
| **A** | Proven historical window from Legacy evidence (≤31d) via `createdFromUtc`/`createdToUtc` | Documented; operator-supplied bounds |
| **B** | `orderBy(data_order, desc) limit≤50` **without** date filters — ONE page, no auto-pagination | **Implemented** as `TripListFilter.boundedLatestPage=true` / env `PHASE4A4_TRIPS_BOUNDED_LATEST=1` |
| **C** | Evidenced historical window from QA/backup metadata | Documented; operator-supplied |

**Forbidden:** get-all, unbounded scan, offset pagination, second auto-query after empty (would make `firestoreQueries>1`).

Operator final verification remains **one** Firestore query: either corrected date window **or** Option B — not both in one run.

---

## 6. Harness closing-gate correction

| Before | After |
|---|---|
| `recordsRead=0` → `mappingReadyForLiveClose=true` → `PASS` | `recordsRead=0` → `mappingReadyForLiveClose=false`, `overallStatus=NO_GO`, `blocker=EMPTY_TRIP_WINDOW` |
| Zero-row treated as mapping success | Zero-row = **insufficient evidence**, not a Production error |

Helpers: `classifyEmptyTripWindow`, `tripMappingReadyForLiveClose` now requires `recordsRead > 0`.

Also: `financialConflicting` / `conflictingLifecycleStatus` block close; `financialUnknown` alone does **not**.

---

## 7. Trip live summary coverage

Summary now includes (zeros required):

- `queryWindowStart` / `queryWindowEnd` / `queryTimestampField` / `queryOrderDirection` / `queryLimit` / `queryMode` / `queryFilterBoundType`
- `recordsRead`, `validMapped`, `testOrNoncanonical`
- `unmappedCountry`, `unmappedCity`, `unmappedStatus`, `malformed`
- `unknownCustomerReference`, `unknownDriverReference`
- `unknownLifecycleStatus`, `conflictingLifecycleStatus`
- `financialUnknown`, `financialConflicting`
- `exactCanonicalDuplicates`, `semanticDuplicates`, `activeOperationalDuplicates`
- `productionWriteCalls`, `unexpectedCollections`

---

## 8. Financial metrics policy

- Persisted historical candidates only (`total_app` / `total_vat` / `total_mndob` / `total_mndob2`)
- **No recompute** with current rates; missing ≠ 0
- `financialUnknown > 0` may be OK
- `financialConflicting > 0` must be reviewed (blocks live close)

---

## 9. Kill-switch observability correction

| Before | After |
|---|---|
| Kill path denied reads but **no** `kill_switch_triggered` in ndjson | `finally` emits `kill_switch_triggered` via real `file_ndjson` sink (same pattern as Phase 4A-3) |
| Only `production_read_request` observed | Expect `production_read_request` … `kill_switch_triggered` + `postKill=PRODUCTION_READ_DISABLED_NO_NEW_QUERY` |

Unit regression proves emission through the real observability mechanism (not a fake-only assert).

---

## 10. Tests / verify

Regression coverage added for:

- `recordsRead=0` → NO_GO / EMPTY_TRIP_WINDOW
- `recordsRead > 0` required for closure
- Date (not ISO string) filter bounds
- ISO string vs Timestamp type-mismatch → zero
- Option B bounded latest ≤50 / one query / no date filters
- missing `data_order` excluded by orderBy
- invalid window fails safely
- kill-switch event via real sink
- zero-result still emits full metric zeros + query meta
- financialUnknown OK; financialConflicting blocks

```text
npm test       → 385 passed | 2 skipped (387) — 41 files
npm run typecheck → PASS
npm run build     → PASS
Production calls  → 0
Production writes → 0
```

---

## Decision

```text
Phase 4A-4 closure: NO-GO (until final live verification)
One final Trips live verification: CONDITIONAL GO
```

**CONDITIONAL GO** means the operator may run **one** controlled live window after this fix:

```bash
# Preferred: corrected Date-window query (default 7d)
PHASE4A4_LIVE_TRIPS=1 FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/phase4a4-live-trips.shadow.test.ts

# If window still empty: Option B (still 1 query, ≤50)
PHASE4A4_LIVE_TRIPS=1 PHASE4A4_TRIPS_BOUNDED_LATEST=1 FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/phase4a4-live-trips.shadow.test.ts
```

Pass criteria: `recordsRead > 0`, mapping gates clean, `kill_switch_triggered` present, writes=0, `firestoreQueries=1`.

**Do not** start Phase 4A-5 Drivers. **Do not** auto-run Production from agents/CI.

# TOURI TAXI ADMIN NEXT — PHASE 4A-4 TRIPS / ORDERS READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 4A-4 Trips / Orders Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Trips-only live shadow window  
(`PHASE4A4_LIVE_TRIPS=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Trips query.**  
Production Read/Write remain **disabled** in local defaults.

| Gate | Result |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| Operator-controlled Trips live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Drivers / Agents / Customers / Finance / Settlement | **NO-GO / not started** |
| Production trip create/edit/cancel / payment / Functions | **NO-GO** |

**Trips readiness score: 86 / 100**

**Production calls = 0**  
**Production writes = 0**

---

## 1. Authoritative Legacy source

Customer, Driver, Admin, Functions, and payment-api **agree** on one trip/order SoT.

| App / surface | Evidence | Collection | Role |
|---|---|---|---|
| **Customer** | `OrderRecord`, checkout / `tfasel_order`, booking CFs | `order` | Create + cancel + read |
| **Driver** | `mndob-main` `OrderRecord`, `driver_trip_service` | `order` | Accept / arrive / start / complete / cancel |
| **Admin** | `Admi` bookings hub, `admin_booking_details_adapter`, finance adapters | `order` | List / detail / cancel / cash confirm |
| **Functions** | `ngenius_payments`, `cash_booking_compatibility`, `auto_cancel_orders`, `cash_collection_realization`, `account_deletion` | `order` | Payment finalize, expire, cash, deletion |
| **Payment API** | `payment-api` bookings / cancel / refunds | `order` (+ `payment_sessions`) | Online payment lifecycle |

**Authoritative primary for Canonical Trip read:** Firestore collection **`order`**.

### Auxiliary collections (not primary Trip SoT)

| Collection / field | Role | Canonical Trip read? |
|---|---|---|
| `payment_sessions` | Online unpaid / gateway session before or beside order | **No** — auxiliary payment |
| `user.active_order_id` | Customer single-active lock pointer | **No** — pointer only |
| `chat` | Trip chat threads | **No** |
| Ratings fields on `order` (`customerRating`, `RetengUser`, review flags) | Embedded on order | Not exposed as separate collection |
| Tracking coords (`mapuser`, `LOKESHN`) | Live location on order | Coords not used for country/city invent |
| Offers / assignment | Status transitions on same `order` doc | No separate offers SoT proven for Admin list |

Resource token: **`trips`**.  
Firestore collection queried: **`order`**.

---

## 2. Exact order schema (production-relevant)

| Concern | Field(s) | Type | Notes |
|---|---|---|---|
| Id | document id | string | `order/{id}` — canonical identity |
| Display id | `IDorder` | string | Alias only — never sole identity |
| Lifecycle | `status_code` | string | **Authoritative** TourySystemStatusCodes |
| Dual-write | `halh_text`, `halh_order`, `halh` | string / enum | Display — not independent SoT |
| Active flag | `ActiveOrder` | boolean | Evidence only — not sole SoT |
| Customer | `USER` | DocumentReference → `user/{id}` | Safe id extract only |
| Driver | `mndob_user` | DocumentReference → `user/{id}` | Null while pending |
| Agent | `agent_id` | string (snapshot) | Historical; never invent current agent |
| Country | `Rev_dolh` | DocumentReference → `countries/{id}` | Phase 4A-1 reuse |
| City | `vill` | DocumentReference → `villages/{id}` | Phase 4A-2 product city |
| Region hint | `cities_user_now` | DocumentReference → `cities/{id}` | Optional; not primary city |
| Landmarks | `listAmakn[]` | array of maps | Pickup = first; destination = last |
| Landmark ref | `listAmakn[].Revmkan` / `mkan_rev` | DocumentReference → `mkan/{id}` | Preserve source path |
| Created | `data_order` | timestamp | **Proven list sort/filter field** |
| Start | `START` | timestamp | Trip start |
| End | `DATEEND`, `endTime` | timestamp | Completion candidates |
| Cancel | `cancelledBy`, `cancelled_by_code`, `cancelReason` / `cancel_reason`, `cancelledAt` | string / timestamp | Actor + reason evidence |
| Payment method | `PaymentMethod` | enum `Cash` \| `OnlinePayment` | Orthogonal to lifecycle |
| Payment status | `payment_status` | string | Orthogonal to lifecycle |
| Platform fee | `total_app` | number (SAR major) | Persisted historical |
| VAT amount | `total_vat` | number (SAR major) | Persisted; **≠ rate** |
| Driver net | `total_mndob` | number (SAR major) | Persisted historical |
| Gross | `total_mndob2` | number (SAR major) | Gross base fare |
| Customer total | `total` | number | Present; financial ops separate |
| Coords | `originLatitude/Longitude`, `destination*`, `LOKESHN`, `mapuser` | number / GeoPoint / LatLng | **Never invent geography** |
| PII (blocked) | `phone_numper`, `phone_nu_mndob`, `naim_user_text`, `naim_mndob_text`, `imgProfileClent`, `img_mndob` | int / string | DO_NOT_EXPOSE |
| Gateway refs | `ngeniusOrderId`, `idMoyser` | string | Financial sensitive — not on ops model |

**Missing ≠ 0.** Unknown numeric fields stay null with `availabilityStatus`.

---

## 3. Trip status model (`TripLifecycleStatus`)

| Priority | Source | Role | Ops safe? |
|---|---|---|---|
| 1 | `status_code` | Authoritative machine field | Yes when mapped |
| 2 | `halh_order` | Dual-write / payment UX overlap | No |
| 3 | `halh_text` | Arabic display dual-write | No |
| 4 | `halh` | Legacy string | No |

**Proven lifecycle names:**  
`pending_driver`, `driver_assigned`, `driver_arriving`, `driver_arrived`, `trip_started`, `trip_in_progress`, `completed`, `cancelled_by_customer`, `cancelled_by_driver`, `cancelled_by_admin`, `expired` (+ aliases `awaiting_driver`→pending, `trip_completed`→completed, `cancelled`/`canceled`→cancel family).

**Not inferred solely from absence** of `ActiveOrder` / `accepted` / `arrived` / `started` / `finished` / finish timestamps. Those flags are corroborating `lifecycleEvidenceFlags` only.

Code: `src/domain/trip/TripLifecycleStatus.ts` + existing `TripStatusSourcePriority.ts`.

---

## 4. Customer / driver identity

| Field | Canonical | Knowledge |
|---|---|---|
| `USER` | `customerId: string \| null` | known \| missing \| unknown |
| `mndob_user` | `driverId: string \| null` | known \| missing \| unknown |

- No PII (`phone_*`, `naim_*_text`, images) on read model.  
- No Production queries to resolve user docs.  
- `pending_driver` with null driver is **missing**, not invented.

---

## 5. Geography (reuse 4A-1/2/3)

| Order field | Target | Mapping |
|---|---|---|
| `Rev_dolh` | `countries/{id}` | `resolveCanonicalCountryId` (4A-1) |
| `vill` | `villages/{id}` | City id + optional alias (4A-2) |
| `listAmakn[0].Revmkan` | `mkan/{id}` | Pickup landmark id + **source path** |
| `listAmakn[last].Revmkan` | `mkan/{id}` | Destination landmark id + **source path** |

Never invent country from coords/phone or city from landmark **name**.

---

## 6. Financial safe-read (NOT accounting)

Frozen persisted candidates via `MoneyKnowledge` (= `CanonicalMoneyField` + `FinancialAvailabilityStatus`) and `Money` minor helper:

| Field | Knowledge classes |
|---|---|
| `total_app` / `total_vat` / `total_mndob` / `total_mndob2` | persisted \| known_zero \| missing \| unknown \| not_represented \| conflicting \| derived |

- Rates (`vatRatePercent`, platform %) → **null / not_represented** unless snapshotted on the order.  
- **Never assume 15%.** Never recompute with current country rates.  
- `isAccountingApproved: false`, `isSettlementSafe: false`.  
- Missing ≠ 0 (`assertIncompleteNotZero`).

Code: `src/domain/trip/TripFinancialSafeRead.ts`.

---

## 7. Payment method

| Legacy | Canonical |
|---|---|
| `Cash` | `cash` |
| `OnlinePayment` | `online` |
| missing | `unknown` |
| other | `unmapped` |

Field: `PaymentMethod` (enum). Separate from lifecycle and from `payment_status`.

---

## 8. Payment status (orthogonal)

| Legacy | Canonical |
|---|---|
| `unpaid` | unpaid |
| `pending_cash` / `cash_pending` / `cash_due` | pending_cash |
| `cash_collected` | cash_collected |
| `processing` | processing |
| `paid` / `captured` | paid |
| `failed` / `refunded` | failed / refunded |
| missing / other | unmapped |

Completed lifecycle ≠ cash collected (Admin finance engine already separates these).

---

## 9. Cancellation model

| Evidence | Use |
|---|---|
| `status_code` cancel/expired family | `isCancelled` + inferred actor when field absent |
| `cancelledBy` / `cancelled_by_code` | Proven actor (customer/driver/admin/system) |
| `cancelReason` / `cancel_reason` / … | Reason when present |
| `cancelledAt` | Timestamp when present |

Conflict between `cancelledBy` and status_code → `actorKnowledge: conflicting`, actor `unknown`. Never invent actor from absence alone.

---

## 10–11. Duplicate / identity + QA artifacts

Offline audit (`TripDuplicateIdentityAudit`):

| Kind | Rule |
|---|---|
| Exact canonical | Same `canonicalTripId`, distinct docs |
| Same `IDorder` alias | Same display id, distinct docs |
| Semantic customer+time | Same `customerId` + `createdAtUtc` |
| Active operational | Multiple `ActiveOrder=true` per customer |

Test/QA → `testOrNoncanonical` (never delete): `cp5_order_*`, `golden_cycle`, CP5 country/city relations, functional_test markers.

**Not safe for live close** if any of  
`unmappedCountry|unmappedCity|unmappedStatus|ambiguous*|malformed|activeOperationalDuplicates` > 0  
(unless documented Legacy evidence after operator live).

---

## 12. CanonicalTripReadModel

`CanonicalTripReadModel` (Phase 4A-4 expanded):

- Identity: `id` / `canonicalTripId` / `sourceDocumentId` / `source: "legacy_order"`
- Lifecycle + payment method/status (separate)
- Safe `customerId` / `driverId` (+ knowledge + source paths)
- Geography + landmark ids with source paths
- Timestamps from `data_order` / `START` / `DATEEND`
- `financialSafeRead` (MoneyKnowledge)
- `cancellation` safe model
- `mappingStatus`, `incompleteReasons`, confidence

Mapper: `mapCanonicalTripFromLegacyDoc` → `DefaultLegacyTripMapper`.

---

## 13. Query design (**DOCUMENT ONLY — not executed live**)

Proven timestamp for list: **`data_order`** (Admin bookings, Customer history, Driver lists, Functions `orderBy("data_order","desc")`).

```text
collection: order
filters:
  data_order >= createdFromUtc   # default window 7d, max 31d
  data_order <= createdToUtc
orderBy: data_order desc
limit: min(request.limit, 50)    # PHASE_4A4_TRIPS_MAX_PAGE
startAfterCursor: document id
resource gate: trips
allowlist: order
NO offset / all-scan
NO N+1 user / villages / mkan / payment_sessions / Storage / Functions
scope: post-map filter by countryId / cityId / agentId
```

### Composite index needs (document — do not invent/deploy)

| Query shape | Likely index | Status |
|---|---|---|
| `data_order` range + orderBy `data_order` | Single-field often sufficient | Documented from Legacy list usage |
| Future: `Rev_dolh` + `data_order` | Composite DocumentReference + timestamp | **Not deployed this phase** — first window post-filters geography |
| Future: `status_code` + `data_order` | Composite | Optional later; status filter is post-map today |

---

## 14–18. Gates / RBAC / PII / repository / write safety

| Item | Implementation |
|---|---|
| Resource gate | `trips` in `LIVE_SHADOW_ALLOWED_RESOURCES` (exact single-resource) |
| Collection allowlist | `order` proven; settlements/ledger denied |
| RBAC / scope | `trips:read`; country/city/agent post-map intersect |
| PII registry | `phone_numper`, `naim_*`, images, gateway ids, financial fields |
| Repository | `FirebaseProductionTripReadRepository.listTrips` via `list()` |
| Write safety | All `PRODUCTION_*_WRITE` flags false; startup FAIL if any true; shadow mutation trap |

`FULL_PII_SHADOW_ENABLED` remains **false**.

---

## 19. Live harness (SKIP by default)

File: `src/test/live/phase4a4-live-trips.shadow.test.ts`  
Gate: `PHASE4A4_LIVE_TRIPS=1` only. **Not executed this session.**

Designed sequence:

1. Auth (verified token)  
2. Project fingerprint (`tutorial-multi-language-70gx4j`)  
3. Startup gate + `LIVE_SHADOW_ALLOWED_RESOURCES=trips`  
4. Bounded `order` query ≤50 orderBy `data_order`  
5. Mapper + duplicate audit  
6. Post-map scope  
7. Write trap deny  
8. Kill switch deny  

### Operator command (future)

```bash
PHASE4A4_LIVE_TRIPS=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a4-live-trips.shadow.test.ts
```

Safe report path: `.local/phase4a4-live/live-safe-summary.json`

---

## 20–21. No N+1 + offline tests

Trip read path issues **one** `order` query (Fake proven). No per-trip customer/driver/city/landmark lookups. No Storage/payment/Functions.

### Offline tests

| File | Purpose |
|---|---|
| `src/test/unit/phase4a4-trips-readiness.test.ts` | Mapping, lifecycle, payment, cancel, finance, gates, pagination, scope, N+1, PII, dups |
| `src/test/live/phase4a4-live-trips.shadow.test.ts` | Always-on regressions + operator live `it` (skipped without flag) |

### Test counts (this phase slice)

| Suite | Passed |
|---|---|
| `phase4a4-trips-readiness.test.ts` | **28** |
| `phase4a4-live-trips.shadow.test.ts` | **5** (live body early-return) |
| **Phase 4A-4 new tests** | **33** |

### Full suite gate

```
npm test && npm run typecheck && npm run build
→ PASS (374 passed | 2 skipped overall; live countries + cities + landmarks + trips live bodies skipped without flags)
```

---

## 22. Score deductions (/100)

| Score | 100 baseline |
|---|---|
| −8 | Live Production inventory unknown (operator window not run) |
| −3 | First window cannot Firestore-`where` on `Rev_dolh` without Admin DocumentReference values (post-map scope only) |
| −2 | Historical orders may lack `status_code` (halh dual-write → unmappedStatus / ops blocked) |
| −1 | Currency often absent on Legacy order docs (not_represented; not invented) |
| **86** | **CONDITIONAL GO** |

---

## GO / NO-GO summary

```
TOURI TAXI ADMIN NEXT — PHASE 4A-4 TRIPS / ORDERS READINESS REPORT
Authoritative collection: order (resource token: trips)
Fake/unit + typecheck + build: PASS
CONDITIONAL GO for one future operator-controlled Trips live window
Trips readiness score 86/100
Production calls = 0
Production writes = 0
STOP. No live executed. No Drivers/Agents/Customers/Finance.
```

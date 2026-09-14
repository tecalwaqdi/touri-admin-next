# TOURI TAXI ADMIN NEXT — PHASE 4A-5 DRIVERS READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 4A-5 Drivers Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Drivers-only live shadow window  
(`PHASE4A5_LIVE_DRIVERS=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Drivers query.**  
Production Read/Write remain **disabled** in local defaults.

| Gate | Result |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| Operator-controlled Drivers live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Agents / Customers / Finance / Settlement | **NO-GO / not started** |
| Driver approve / reject / suspend / edit / wallet | **NO-GO** |

**Drivers readiness score: 84 / 100**

**Production calls = 0**  
**Production writes = 0**

---

## 1. Authoritative driver source

Drivers are **not** a separate collection. Customer, Driver, Admin, and Functions agree on Firestore **`user`**.

| App / surface | Evidence | Collection | Discriminator |
|---|---|---|---|
| **Driver app** | `mndob-main` `UserRecord.collection` → `user` | `user` | `ismndob` / `ismndom` |
| **Admin** | `dashboard_stats_loader`, `admin_ops_filters` `ismndob==true` | `user` | `ismndob == true` |
| **Functions** | `account_deletion.isDriverProfile` | `user` | `ismndob === true \|\| ismndom === true` |
| **Customer** | Same `user` collection; non-driver when `!ismndob && !Isagent` | `user` | opposite of driver flags |

**Authoritative primary for Canonical Driver read:** Firestore collection **`user`** filtered by **`ismndob == true`**.

| Shared with | Discriminator fields |
|---|---|
| Customers | `ismndob != true` (and typically not agent) |
| Agents | `Isagent == true` (orthogonal persona flag) |
| Admins | Admin auth claims / separate admin surfaces — not `ismndob` |

Typo alias **`ismndom`**: treated as driver in Functions deletion + some dual-writes; **Admin list queries use `ismndob` only**. Docs that are `ismndom=true` with `ismndob` missing/false may be missed by the primary query (documented — not client filter-all).

Resource token: **`drivers`**.  
Firestore collection queried: **`user`**.

---

## 2. Driver identity

| Concept | Source | Notes |
|---|---|---|
| `sourceDocumentId` | Firestore `user/{id}` document id | Canonical list/detail identity |
| `authUid` | `uid` field on the document | Separated when ≠ document id → `authUidKnowledge: mismatch` |
| `canonicalDriverId` | Same as document id | No silent merge across docs |

**No full PII by default:** phone (`phone_number` / `phone_n`), email, national ID (`ID_hoyh_MNDOB`), document URLs (`img_*`, `doc_*.url/storagePath`), IBAN/bank fields are **blocked / not on safe model**.  
`FULL_PII_SHADOW_ENABLED=false` remains mandatory.

---

## 3–4. Registration lifecycle + six orthogonal states

### Registration (SoT: `registration_status`, fallback `submission_status`)

| Raw Legacy | Canonical |
|---|---|
| `draft` | `draft` |
| `pending_review`, `submitted`, `pending` | `pending_review` |
| `approved` | `approved` |
| `rejected` | `rejected` |
| `needs_changes`, `changes_requested` | `needs_changes` |
| `suspended`, `blocked` | `suspended` |
| missing / other | `unknown` |

Evidence: `AdminDriverProfileView.reviewBucketFromRaw`, `UserRecord` comments, Admin approve patches.

### Six axes (never collapse unless Legacy explicitly derives)

| Axis | Fields | Values | Derived? |
|---|---|---|---|
| **registration** | `registration_status` / `submission_status` | draft…suspended/unknown | No |
| **account** | `actev_mndob` (+ optional `account_status`) | enabled / disabled / unknown | No |
| **online** | `is_online` → `ngl` → `operational_status` | online / offline / unknown | No |
| **availability** | account + online + trip | available / busy / unavailable / unknown | **Yes — Legacy `admin_driver_status_truth`** |
| **tripState** | `mndon_newacc` / `on_trip` / ops `on_trip`\|`busy` | idle / busy / unknown | No (flags on user doc) |
| **compliance** | `registration_documents_status` / doc presence | ready / incomplete / expired / unknown | Presence summary only |

**Proven rule:** `pending_review` + `actev_mndob=true` ≠ approved.

**Approved ≠ online ≠ available ≠ busy.** Missing busy flags → `tripState=unknown` (not invented idle from absence of all fields; explicit `false` → idle).

Code: `CanonicalDriverRegistrationStatus.ts`, `DriverCanonicalStatuses.ts`.

---

## 5. Geography

Reuse CLOSED Phase 4A-1 / 4A-2 mappings.

| Driver field | Target | Mapping |
|---|---|---|
| `Rev_dolh` | `countries/{id}` | `resolveCanonicalCountryId` + **source path preserved** |
| `mndob_vill` | `villages/{id}` | City id + optional alias + **source path preserved** |

**Never** invent country/city from `loceshnMndobNow` / `loceshnMn` / phone.

---

## 6–7. Online/availability vs approved; current trip evidence

- Online/availability are **orthogonal** to registration approval (Admin truth + Driver resolver).
- **Active trip in readiness:** user-doc evidence only (`mndon_newacc` / ops).  
  Legacy Admin detail may N+1 `order` where `mndob_user` + non-terminal — **not used in 4A-5 readiness** (no extra Production lookups).
- `ActiveOrder` on orders is trip SoT (4A-4), not required for driver list readiness.

---

## 8–9. Documents / compliance + vehicle

**Compliance safe summary:** slot `present | missing | unknown` only.  
No URLs, storage paths, ID numbers, or images on the read model.

Slots: profile_photo, national_id, vehicle_registration, driver_license, vehicle_photo  
(+ overall from `registration_documents_status` when present).

**Vehicle:** `mndob_type_car` / `NameCar` / `ModelCar` / masked plate from `number_lohh_car`.  
`normalized_plate` is **not** proven as a safe operational read field (Admin normalize is write-side) → **`normalizedPlateExposed: false`**, plate always masked.

---

## 10. Financial fields (classify / document only)

| Legacy field | Class | Exposure |
|---|---|---|
| `total_mndob`, `total_app`, `totalMndob2` | legacy_aggregate_major | DOCUMENT_ONLY |
| `Outstandingonlinepayment` | outstanding_online | DOCUMENT_ONLY |
| `bankNaim`, `bankIdAcc`, `ipanBank`, `banknaimAcc` | bank_pii | DO_NOT_EXPOSE_YET |

`isAccountingApproved: false`, `isSettlementSafe: false`, `isAuthoritative: false`.  
**Finance / Settlement / VAT / earnings calc blocked.**

---

## 11–13. PII redaction + duplicate audit + test markers

Sensitive registry extended for driver: `phone_number`, `phone_n`, `ID_hoyh_MNDOB`, `img_*`, `number_lohh_car`, bank fields, GPS.

Duplicate audit (offline + live-safe metrics):

| Kind | Rule |
|---|---|
| Exact document id | Same `sourceDocumentId` twice |
| Auth UID collision | Same `authUid` on distinct docs (hashed metrics only) |
| Phone / plate | SHA-256 fingerprints only — never raw phone |
| Test/demo | `cp5_*`, `test_*`, `demo_*`, `@touri-taxi-test`, functional_test markers |

---

## 14. CanonicalDriverReadModel

Expanded model (`src/domain/canonical/CanonicalReadModels.ts` + `mapCanonicalDriverFromLegacyDoc`):

- Identity: `id` / `canonicalDriverId` / `sourceDocumentId` / `authUid` (+ knowledge)
- Discriminator: `isDriver`, `discriminatorField`
- Six status axes + Legacy-compatible provenanced booleans
- Geography + source paths
- Vehicle masked summary + compliance presence summary
- Financial presence inventory (non-authoritative)
- `mappingStatus`, `incompleteReasons`, confidence, warnings

Mapper: `DefaultLegacyDriverMapper` → `mapCanonicalDriverFromLegacyDoc`.

---

## 15. Query design (**DOCUMENT ONLY — not executed live**)

Proven Admin list shape (`admin_ops_filters.applyDriverFilters`):

```text
collection: user
filters:
  ismndob == true
orderBy: created_time desc   # when date window; else documentId
limit: min(request.limit, 50)  # PHASE_4A5_DRIVERS_MAX_PAGE
startAfterCursor: document id
resource gate: drivers
allowlist: user
NO offset / all-scan / filter-all without discriminator
NO N+1 order / Storage / Auth disable lookup / Functions
scope: post-map filter by countryId (Rev_dolh) / cityId (mndob_vill)
```

### Composite index needs (document — do not invent/deploy)

| Query shape | Likely index | Status |
|---|---|---|
| `ismndob` + `created_time` | Composite boolean + timestamp | Used by Legacy Admin with date range |
| Future: `ismndob` + `Rev_dolh` + `created_time` | Composite | **Not deployed this phase** — first window post-filters geography |
| `ismndom`-only orphans | Not in primary query | Documented gap — do not client-scan all `user` |

---

## 16–18. Resource gate / RBAC / write safety

| Item | Implementation |
|---|---|
| Resource gate | `drivers` in `LIVE_SHADOW_ALLOWED_RESOURCES` (exact single-resource; Phase 4A-5) |
| Collection allowlist | `user` proven; settlements/ledger denied |
| RBAC / scope | `drivers:read`; country/city post-map intersect |
| PII | Registry + blocked fields; no `drivers:read_pii` auto-reveal (`FULL_PII_SHADOW` false) |
| Repository | `FirebaseProductionDriverReadRepository.list` via `ismndob==true` |
| Write safety | All write flags false incl. `DRIVER_WRITE_ENABLED`; startup FAIL if any true; shadow mutation trap denies approve/reject/suspend/edit/wallet |

---

## 19. Live harness (SKIP by default)

File: `src/test/live/phase4a5-live-drivers.shadow.test.ts`  
Gate: `PHASE4A5_LIVE_DRIVERS=1` only. **Not executed this session.**

Designed sequence:

1. Auth (verified token)  
2. Project fingerprint (`tutorial-multi-language-70gx4j`)  
3. Startup gate + `LIVE_SHADOW_ALLOWED_RESOURCES=drivers`  
4. Bounded `user` query ≤50 `ismndob==true` orderBy `created_time`  
5. Mapper + duplicate audit  
6. Post-map scope  
7. Write trap deny  
8. Kill switch deny  

### Operator command (future)

```bash
PHASE4A5_LIVE_DRIVERS=1 FIREBASE_ID_TOKEN='<prod-id-token>' \
  npx vitest run src/test/live/phase4a5-live-drivers.shadow.test.ts
```

Safe report path: `.local/phase4a5-live/live-safe-summary.json`

---

## 20–21. No N+1 + offline tests

Driver read path issues **one** `user` query (Fake proven). No per-driver order/Storage/Auth lookups.

### Offline tests

| File | Purpose |
|---|---|
| `src/test/unit/phase4a5-drivers-readiness.test.ts` | Mapping, axes, geo, compliance, vehicle, finance classify, dups, gates, pagination, scope, N+1, PII, writes |
| `src/test/live/phase4a5-live-drivers.shadow.test.ts` | Always-on regressions + operator live `it` (skipped without flag) |

### Test counts (this phase slice)

| Suite | Passed |
|---|---|
| `phase4a5-drivers-readiness.test.ts` | **31** |
| `phase4a5-live-drivers.shadow.test.ts` | **5** (live body early-return) |
| **Phase 4A-5 new tests** | **36** |

### Full suite gate

```
npm test && npm run typecheck && npm run build
→ PASS (439 passed | 2 skipped overall; live countries + cities + landmarks + trips + drivers live bodies skipped without flags)
```

---

## 22. Score deductions (/100)

| Score | 100 baseline |
|---|---|
| −8 | Live Production inventory unknown (operator window not run) |
| −3 | First window cannot Firestore-`where` on `Rev_dolh` without Admin DocumentReference values (post-map scope only) |
| −2 | `ismndom`-only orphan drivers may be missed by `ismndob==true` primary query |
| −2 | Trip busy evidence limited to user flags (no ActiveOrder corroboration in readiness — by design) |
| −1 | Historical drivers may lack `registration_status` → unknown registration |
| **84** | **CONDITIONAL GO** |

---

## GO / NO-GO summary

```
TOURI TAXI ADMIN NEXT — PHASE 4A-5 DRIVERS READINESS REPORT
Authoritative collection: user + ismndob==true (resource token: drivers)
Fake/unit + typecheck + build: PASS
CONDITIONAL GO for one future operator-controlled Drivers live window
Drivers readiness score 84/100
Production calls = 0
Production writes = 0
STOP. No live executed. No Agents/Customers/Finance.
```

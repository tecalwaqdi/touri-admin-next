# TOURI TAXI ADMIN NEXT — PHASE 4A-7 CUSTOMERS READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 4A-7 Customers Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Customers-only live shadow window  
(`PHASE4A7_LIVE_CUSTOMERS=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Customers query.**  
Production Read/Write remain **disabled** in local defaults.

| Gate | Result |
|---|---|
| Fake/unit + typecheck + build | **GO** (tests PASS; typecheck/build verified in session) |
| Operator-controlled Customers live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Finance / Settlements / Reports / Phase 4B | **NO-GO / not started** |
| Customer create / activate / suspend / delete / wallet write | **NO-GO** |

**Customers readiness score: 84 / 100**

**Production calls = 0**  
**Production writes = 0**

---

## 1. Authoritative Customer source

Customers are **not** a separate collection. Shared Firestore **`user`** (same lesson as Drivers 4A-5 / Agents 4A-6).

| Surface | Evidence | Collection | Discriminator |
|---|---|---|---|
| **Admin customers page** | `admin_customers_adapter.adminIsAppCustomer` | `user` | `!isagent && !ismndob && !ismndom` |
| **Dashboard / counters** | `dashboard_stats_loader.countAppUsers` / `AdminOpsCounters.appUsersFromParts` | `user` | Inclusion-exclusion: total − agents − drivers + both |
| **Admin list query** | `AdminOpsQueryBuilder.applyUserFilters` | `user` | Optional `Rev_dolh` + `created_time` order; **role filter is client-side** |
| **Customer App signup** | `ara_oatan_app` `home_pag_widget` / `createUserRecordData` | `user` | Writes profile **without** `ismndob` / `Isagent` (rules reject those keys for self-provision) |
| **Account deletion** | `account_deletion.js` | `user` | Non-driver → `role: 'customer'` |

**Authoritative primary for Canonical Customer read:** Firestore collection **`user`** with **exclusionary** membership (not a positive `is_customer` flag).

| Shared with | How separated |
|---|---|
| Drivers | `ismndob` / `ismndom` → `excludedNonCustomer` |
| Agents | `Isagent` / `isagent` → `excludedNonCustomer` |
| Super admin / finance / partner / transport / country_admin / tour_guide | Contaminating identities → `excludedNonCustomer` (not geography / malformed) |

**Prior Phase 4A-0 stub error corrected:** repository previously queried invented `is_customer` + `country_id`. **Replaced** with evidence-backed exclusionary membership + `Rev_dolh` geography.

Resource token: **`customers`**.  
Firestore collection queried: **`user`**.

---

## 2. Discriminator vs role contamination

**Do NOT assume every non-driver is Customer.**

```
isCustomerCandidate =
  !(ismndob===true || ismndom===true)
  && !(Isagent===true || isagent===true)

isContaminatingNonCustomerIdentity =
  IsAdmin/isAdmin || isAdminRule ∈ {1,2,3,4,5}
  || is_partner/isPartner || is_tour_guide
  → roles: super_admin | finance | partner | transport | country_admin | tour_guide

hasProvenCustomerRoleEvidence =
  actev_user present || phone_number || phone_n
  || email || display_name || Bookings_User || created_time

isOperationalCustomer =
  isCustomerCandidate && !contaminating && hasProvenCustomerRoleEvidence
```

**Critical difference vs Agents:** `isAdminRule=2` (country_admin) **IS** contamination for Customer domain (Admin agents are not app customers).

Contaminated / persona rows → **`excludedNonCustomer`**, never `unmappedCountry` / malformed geography.

Module: `src/domain/customer/CustomerRoleClassification.ts`

---

## 3. Identity

| Concept | Source | Notes |
|---|---|---|
| `sourceDocumentId` | Firestore `user/{id}` document id | Canonical list/detail identity |
| `authUid` | `uid` field on the document | Separated when ≠ document id → `authUidKnowledge: mismatch` |
| `canonicalCustomerId` | Same as document id | No silent merge across docs |

Auth UID is identity only — **never** authoritative for Customer vs admin/driver/agent role.

---

## 4–5. CRITICAL PII

**No raw** email / phone / address / ID / device / FCM / notes / bank / password / URLs in:

- CanonicalCustomerReadModel (values + provenance.sourceValue)
- live-safe-summary
- observability events
- error messages

Server-side redaction: masked contact hints only:

| Hint | Example |
|---|---|
| Phone | `***1234` |
| Email | `os***@example.com` |

`FULL_PII_SHADOW_ENABLED=false` mandatory — even `customers:read_pii` / `allowFullPii` cannot reveal raw contacts.

Blocked fields on envelope: `phone_number`, `phone_n`, `email`, `photo_url`, `address`, `adresslist`, `fcm_token`, `password`, bank fields.

Helpers: `CustomerContactHints.ts`. Registry extended for `resource: customer`.

---

## 6–9. Account vs Auth; profile; geography; activity

### Account (SoT: `admin_customers_adapter.accountStatusFromData`)

| Axis | Field(s) | Values | Notes |
|---|---|---|---|
| **account** | `actev_user` | enabled / disabled / unknown | Orthogonal |
| **authEnabled** | — | `not_queried` | Auth Admin never called |
| **authEmailVerified** | — | `not_queried` | Auth `emailVerified` is SoT in Customer App — **not** on Firestore |

Missing `actev_user` → **unknown** (not invented active).

### Profile states

No separate customer registration lifecycle proven on Firestore (unlike Drivers’ `registration_status`).  
Verification remains Auth-only → not represented on Canonical model beyond `not_queried`.

### Geography (CLOSED 4A-1 / 4A-2 maps)

| Customer field | Target | Mapping |
|---|---|---|
| `Rev_dolh` | `countries/{id}` | `resolveCanonicalCountryId` + **source path preserved** |
| `mndob_vill` | `villages/{id}` | City id + optional alias + **source path preserved** |

**Never** invent country/city from:

- `city_display` / `SuggestedPlaceCity` / `mndob_vill_text` / `vill_text` / `city`
- phone / email / language / GPS / currency / name

**Optional geography:** Customer App signup often omits `Rev_dolh` → operational customers with no country/city refs → **`geographyNotRepresented`** / `geographyRepresentation: not_represented` (proven by create flows).

### Activity — no N+1

| Hint | Source | Notes |
|---|---|---|
| `tripLockHint` | `active_order_id` / `activeOrderId` on user doc | `none` \| `lockPresent` — **no order fetch** |
| `Bookings_User` | user doc aggregate | DOCUMENT_ONLY count presence |

Legacy Admin detail may resolve live order truth — **not used** in 4A-7 readiness.

---

## 10–14. Financial, contamination, test markers, duplicates, Canonical model

### Financial — DOCUMENT_ONLY

| Legacy field | Class | Exposure |
|---|---|---|
| `Bookings_User` / aliases | activity_count | DOCUMENT_ONLY |
| `wallet_balance` | wallet | DO_NOT_EXPOSE_YET |
| `Outstandingonlinepayment` | payment | DO_NOT_EXPOSE_YET |

`isAccountingApproved=false`, `isSettlementSafe=false`, `isAuthoritative=false`.  
**No Finance / Settlement / Reports in 4A-7.**

### Role contamination → excludedNonCustomer

SUPERADMIN / DRIVER / AGENT / finance / partner / transport / country_admin / tour_guide → **`excludedNonCustomer`** with authoritative role evidence (never geography bucket).

### testOrNoncanonical

Only with evidence: id prefixes `cp5_`/`test_`/`demo_`/`golden_`/`qa_`, flags `functional_test` / `is_test` / `demo` / `qa_fixture`, or `@touri-taxi-test` markers.

### Duplicate audit

Exact document id duplicates; authUid collisions; **phoneHash / emailHash** (SHA-256 only — never raw contacts).

### CanonicalCustomerReadModel

`src/domain/canonical/CanonicalReadModels.ts` + `mapCanonicalCustomerFromLegacyDoc`:

- Identity + exclusionary membership + contamination role
- Account / Auth-not-queried axes
- Masked phone/email hints
- Geography paths + `geographyRepresentation`
- tripLockHint + DOCUMENT_ONLY financial inventory
- mappingStatus: `validMapped` | `unmappedCountry` | `unmappedCity` | `geographyNotRepresented` | `malformed` | `unknownDiscriminator` | `testOrNoncanonical` | `excludedNonCustomer`

---

## 15–19. Query, RBAC, write safety

### Bounded query (**DOCUMENT ONLY — not executed live**)

```
collection: user
filters: []   # NO invented is_customer equality — membership is post-map exclusionary
orderBy: FieldPath.documentId() (__name__) asc
limit: ≤50
cursor: startAfter document id
resource gate: customers
allowlist: user
NO offset / NO fetch-all / NO created_time orderBy (4A-6 index lesson)
NO order N+1 / Auth Admin N+1
```

Constants: `PHASE_4A7_CUSTOMERS_MAX_PAGE=50`, order `__name__`, discriminator kind `exclusionary_non_driver_non_agent`, `positiveEqualityFilterApplied=false`.

**Residual risk (CONDITIONAL):** pages mix drivers/agents/admins until post-map partition; operator live must inspect `excludedNonCustomer` + partition reconcile.

### Optional country policy (like Trips)

Country/city scope applied **post-map** from `Rev_dolh` / `mndob_vill` (DocumentReference — deferred Firestore equality). Docs without country fall outside scoped lists; unscoped global reads still surface `geographyNotRepresented`.

### RBAC

Permissions: `customers:read` (PII permission reserved; FULL_PII stays false).  
Scope: global / country (post-map).

### Write safety

All write flags false including **`CUSTOMER_WRITE_ENABLED=false`**.  
Shadow trap denies `POST /api/customers/activate`.  
No create / activate / suspend / delete / wallet in readiness path.

---

## 20–23. Live harness (SKIP)

File: `src/test/live/phase4a7-live-customers.shadow.test.ts`

- Requires **`PHASE4A7_LIVE_CUSTOMERS=1`**
- Startup allowlist exactly `"customers"` (`PHASE_4A7_LIVE_RESOURCES`)
- Closing gates + partition reconcile wired
- Observability / live-safe-summary leak detectors (no PII)
- **NOT executed this session**

Closing gates:

- `unmappedCountry=0`
- `unknownDiscriminator=0`
- `malformed=0`
- `exactDocumentIdDuplicates=0`
- `unexpectedCollections=0`
- `productionWrites=0`
- `excludedNonCustomerWithoutEvidence=0`

Partition:

`recordsRead = validMapped + testOrNoncanonical + excludedNonCustomer + unmappedCountry + unmappedCity + geographyNotRepresented + malformed + unknownDiscriminator`

---

## 24. Offline verification

| Check | Result |
|---|---|
| `npm test` | **PASS** — 551 passed, 2 skipped (live bodies); Phase 4A-7 suite 49/49 |
| `npx tsc --noEmit` (customer/4A-7 surface) | **PASS** — no TS errors in Phase 4A-7 paths |
| `npm run build` | **PASS** |
| Live Production Customers query | **NOT RUN** |

---

## Score breakdown (/100)

| Area | Score | Notes |
|---|---|---|
| Authoritative source + exclusionary membership | 13/15 | Proven Admin predicate; no positive Firestore filter |
| Role contamination model | 12/12 | Reused Drivers/Agents lesson; country_admin excluded |
| Identity + CRITICAL PII redaction | 12/12 | Masked hints only; FULL_PII trapped |
| Account / Auth separation | 10/10 | Auth enabled / emailVerified never invented |
| Geography (CLOSED maps + not_represented) | 10/12 | Optional Rev_dolh proven; city text ignored |
| Financial DOCUMENT_ONLY | 8/10 | Activity counts only; wallet blocked |
| Query bounds + write safety | 10/10 | ≤50 documentId cursor; CUSTOMER_WRITE false |
| Offline tests + harness SKIP | 9/9 | Extensive Fake/unit; live harness gated |
| Residual Production unknowns | 0/10 | Live mix-page ratio / geography distribution unknown |

**Total: 84 / 100 → CONDITIONAL GO**

---

## GO | CONDITIONAL GO | NO-GO

**CONDITIONAL GO** for one future **operator-controlled** Customers live window  
(`PHASE4A7_LIVE_CUSTOMERS=1`, `LIVE_SHADOW_ALLOWED_RESOURCES=customers`, all writes false, `FULL_PII_SHADOW_ENABLED=false`).

Live must confirm:

1. Partition reconcile OK on real pages (mixed personas expected)
2. `excludedNonCustomer` rows carry authoritative role evidence
3. No raw PII in live-safe-summary / observability
4. `unknownDiscriminator` / `malformed` / unmapped country gates as configured
5. Production writes remain 0

**STOP.** Do not start Finance / Settlements / Reports / Phase 4B. Do not enable Production writes. Do not run live automatically.

---

## Code inventory (Phase 4A-7)

| Path | Role |
|---|---|
| `src/domain/customer/CustomerRoleClassification.ts` | Membership / contamination |
| `src/domain/customer/CustomerAccountSemantics.ts` | Account / trip-lock (no N+1) |
| `src/domain/customer/CustomerFinancialFieldNotes.ts` | DOCUMENT_ONLY financial inventory |
| `src/domain/customer/CustomerContactHints.ts` | Masked phone/email hints |
| `src/domain/customer/CustomerDuplicateIdentityAudit.ts` | Audit + partition reconcile |
| `src/domain/customer/CustomerMappingDiagnostic.ts` | Safe live diagnostics / closing gates |
| `src/domain/customer/CustomerLiveQueryFailure.ts` | Index / permission classifiers |
| `src/domain/customer/mapCanonicalCustomerRead.ts` | Legacy → CanonicalCustomerReadModel |
| `src/domain/customer/isPhase4A7LiveCustomersEnabled.ts` | Live gate helper |
| `src/infrastructure/production/repositories/FirebaseProductionCustomerReadRepository.ts` | Production read repo (corrected) |
| `src/test/unit/phase4a7-customers-readiness.test.ts` | Offline suite |
| `src/test/live/phase4a7-live-customers.shadow.test.ts` | Live harness (SKIP default) |

---

```
TOURI TAXI ADMIN NEXT — PHASE 4A-7 CUSTOMERS READINESS REPORT
Customers readiness score: 84 / 100
CONDITIONAL GO
Production calls = 0
Production writes = 0
```

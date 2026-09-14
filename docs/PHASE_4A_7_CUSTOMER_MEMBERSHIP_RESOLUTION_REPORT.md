# TOURI TAXI ADMIN NEXT — PHASE 4A-7 CUSTOMER MEMBERSHIP RESOLUTION REPORT

**Date:** 2026-09-12  
**Phase:** 4A-7 resolve unknown Customer discriminator (offline)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**PHASE4A7_LIVE_CUSTOMERS:** not executed  

---

## Verdict

**CONDITIONAL GO** for one final operator-controlled Customers live verification  
(`PHASE4A7_LIVE_CUSTOMERS=1`) after Fake/unit + typecheck + build PASS.

Prior live `unknownDiscriminator=7` was a **membership / positive-evidence**  
misclassification — not geography. Offline fix partitions those rows as  
`excludedUnknownIdentity` (exclusionary candidate without positive CUSTOMER  
evidence). Missing `Rev_dolh` on unknown identity must not become  
`unmappedCountry`.

**STOP.** Do not start Phase 4B / Finance.

---

## how Legacy derives CUSTOMER role

| Surface | Evidence | Rule |
|---|---|---|
| **QA Auth inventory** | `pre_reset_inventory.js` / `reset_operational_baseline.js` | After SUPERADMIN → FINANCE → COUNTRY_ADMIN → DRIVER, residual `Object.keys(doc).length > 0 \|\| u.email` → `CUSTOMER`; else `UNKNOWN` |
| **Admin customers list** | `admin_customers_adapter.adminIsAppCustomer` | `!isagent && !ismndob && !ismndom` (**exclusion-only**) |
| **Customer App signup** | `home_pag_widget` + `createUserRecordData` | Writes `email`, `display_name`, `uid`, `created_time`, `phone_number`/`phone_n`, `actev_user: true` — **no** `ismndob` / `Isagent` |
| **Account deletion** | `account_deletion.js` | Non-driver profile → audit `role: 'customer'` |
| **Positive `is_customer` field** | — | **Does not exist** — do not invent |

Inventory SUPERADMIN: `IsAdmin===true \|\| isAdminRule===1` (claims optional).  
Inventory DRIVER: `registration_status` / `actev_mndob` / `registration_flow_version` / `mndobTypeCar` (not bare `ismndob`).

---

## positive Customer evidence fields

Admin Next (adapted to real Legacy fields — no invented `is_customer`):

```
isCustomerCandidate =
  !(ismndob===true || ismndom===true)
  && !(Isagent===true || isagent===true)

hasPositiveCustomerEvidence =
  actev_user present
  || phone_number
  || phone_n (non-zero)
  || email
  || display_name / displayName
  || Bookings_User / bookings_count
  || created_time / created_at

knownOtherRole =
  driver/agent persona
  || IsAdmin/isAdmin
  || isAdminRule ∈ {1,2,3,4,5}
  || is_partner/isPartner
  || is_tour_guide

isOperationalCustomer =
  isCustomerCandidate
  && hasPositiveCustomerEvidence
  && !knownOtherRole
```

`uid` alone is **identity**, not Customer proof.  
Bare `Object.keys(doc)>0` inventory residual over-labels stubs; Admin Next requires  
signup/inventory **profile** residual fields above.

Module: `src/domain/customer/CustomerRoleClassification.ts`

---

## why exclusion-only membership was unsafe

`adminIsAppCustomer` (`!Isagent && !ismndob && !ismndom`) is a **shared-collection  
candidate filter**, not positive CUSTOMER evidence. Any non-driver/non-agent doc  
matched — including empty/stub profiles — and then hit geography /  
`unknownDiscriminator` paths.

Live symptom: 7 rows with `authoritativeRole=unknown`, `accountState=unknown`,  
missing `Rev_dolh`, `testClassification=operational` — treated as discriminator  
failures instead of **unknown shared-user identity**.

---

## classification of the 7 prior records

Classified **by evidence rules only** (UID list used as offline fixture shape,  
not hardcoded Customer/non-Customer labels).

Live shape: exclusionary candidate, no signup/inventory positive CUSTOMER fields,  
missing `Rev_dolh`, `accountState=unknown`.

| Rule outcome | Mapping status |
|---|---|
| Cannot establish CUSTOMER (no positive evidence) | **`excludedUnknownIdentity`** |
| Inventory DRIVER / SUPERADMIN / Agent / panel | `excludedNonCustomer` (not these 7) |
| Inventory CUSTOMER (positive residual fields present) | operational Customer → geography gates |

Expected for all 7 under the observed live shape:

- `mappingStatus=excludedUnknownIdentity`
- `authoritativeRole=unknown`
- `hasPositiveCustomerEvidence=false`
- `isOperationalCustomer=false`
- `countryMapping=excludedUnknownIdentity` / geography `not_applicable`
- **not** `unmappedCountry`, **not** `unknownDiscriminator`, **not** Customer

IDs (fixture only):  
`3NEQg1BjO7cf1VEBMyBOUjZplOm2`, `4j7vBIU392RL94ncZlmPQR81WJj1`,  
`6X0FzrjiiofFDxr5Uypsy0sJpSA3`, `CT2QJiB1wPdgs0BhOOIQ9tzO36f1`,  
`JAsiOGQIlVcYkGkgGNDRzCzT22l2`, `P1BTGrbNOrZCeKPEClXbo7LSA2O2`,  
`R1INH7tuV9YFy8MtClTi8CVLAGt1`

---

## geography sequencing fix

1. Classify membership first (`candidate` / `positive` / `knownOtherRole`).  
2. Geography **only** when `isOperationalCustomer`.  
3. Optional geography (signup often omits `Rev_dolh`) → `geographyNotRepresented`  
   for **proven** operational Customers.  
4. Invalid required `Rev_dolh` → `unmappedCountry` **only** for proven operational  
   Customers (malformed geography is **not** hidden).  
5. Unknown identity + missing `Rev_dolh` → `excludedUnknownIdentity` /  
   `not_applicable` — **never** `unmappedCountry`.

---

## partition model

Mutually exclusive:

```
recordsRead
  = validMapped
  + testOrNoncanonical
  + excludedNonCustomer
  + excludedUnknownIdentity
  + unmappedCountry
  + unmappedCity
  + geographyNotRepresented
  + malformed
  + unknownDiscriminator
```

`reconcileCustomerAuditPartition()` → `partitionReconcileOk=true` when sum matches.

Closing gates still require `unknownDiscriminator=0`, `unmappedCountry=0`,  
`malformed=0`. `excludedUnknownIdentity` is an **allowed** partition bucket  
(not a NO-GO by itself).

Safe diagnostics (no raw PII): `sourceDocumentId`, `customerCandidate`,  
`hasPositiveCustomerEvidence`, `authoritativeRole`, `roleEvidenceKind`,  
`mappingStatus`, `testClassification`, `countryMapping`, geography paths/ids,  
`accountState`.

---

## tests

Offline unit coverage added/updated in `phase4a7-customers-readiness.test.ts`:

- exclusion alone ≠ positive evidence  
- signup fields → operational Customer  
- uid-only / no positive → `excludedUnknownIdentity`  
- missing `Rev_dolh` on unknown ≠ `unmappedCountry`  
- DRIVER / SUPERADMIN → `excludedNonCustomer`  
- prior-7 fixture shape → 7× `excludedUnknownIdentity`, partition OK  
- proven Customer + invalid `Rev_dolh` stays `unmappedCountry`  
- partition includes `excludedUnknownIdentity`; closing gates still pass  

Live harness updated for `excludedUnknownIdentity` + `partitionReconcileOk`  
(still SKIP unless `PHASE4A7_LIVE_CUSTOMERS=1`).

---

## Verification this session

| Gate | Result |
|---|---|
| `npm test` | **PASS** — 560 passed \| 2 skipped (562) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Production calls | **0** |
| Production writes | **0** |
| Live Customers auto-run | **not executed** |

---

## CONDITIONAL GO / NO-GO for one final Customers live verification

**CONDITIONAL GO** — operator-controlled only:

```
PHASE4A7_LIVE_CUSTOMERS=1
LIVE_SHADOW_ALLOWED_RESOURCES=customers
PRODUCTION_READ_ENABLED=true (shadow)
all write flags false
FULL_PII_SHADOW_ENABLED=false
```

Expect prior 7 (if still same shape) in `excludedUnknownIdentity`,  
`unknownDiscriminator=0`, `unmappedCountry=0` unless a true operational Customer  
has invalid country, `partitionReconcileOk=true`.

**NO-GO** for auto-run / CI live / Phase 4B / Finance / Customer writes.

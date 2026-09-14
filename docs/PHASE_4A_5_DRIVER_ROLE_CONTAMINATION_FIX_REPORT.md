# TOURI TAXI ADMIN NEXT — PHASE 4A-5 DRIVER ROLE CONTAMINATION FIX REPORT

**Date:** 2026-09-12  
**Phase:** 4A-5 fix Driver role contamination (offline)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  
**Affected sourceDocumentId:** `ZA8yOrIEYIZnmXx85ja9yyctIJu1`  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**PHASE4A5_LIVE_DRIVERS:** not executed

---

## Verdict

**CONDITIONAL GO** for one final operator-controlled Drivers live verification  
(`PHASE4A5_LIVE_DRIVERS=1`) after Fake/unit + typecheck + build PASS.

Prior live `unmappedCountry=1` for this id was a **discriminator / admin contamination**  
misclassification — not a geography gap. Offline fix excludes SUPERADMIN from the  
Driver domain before `Rev_dolh` gates. Live must confirm `excludedNonDriver≥1` with  
authoritative role evidence and `unmappedCountry=0` (unless a true operational Driver  
is still missing country).

**STOP.** Do not start Phase 4A-6 Agents / Customers / Finance.

---

## 1. Root cause

`ismndob==true` alone is too weak as a Driver membership predicate.  
`user/ZA8yOrIEYIZnmXx85ja9yyctIJu1` is an administrative identity (SUPERADMIN) that  
also matches the Admin driver list discriminator. Missing `Rev_dolh` was incorrectly  
counted as Driver `unmappedCountry`.

This is a **role contamination / discriminator** problem — **not** geography.

---

## 2. How `auth_inventory.json` derived `role=SUPERADMIN`

**Writer:** `admin/ara_oatan_app/firebase/functions/scripts/pre_reset_inventory.js`  
**Artifact:** `qa_master_audit/pre_reset/auth_inventory.json`  
**Same predicate** in `reset_operational_baseline.js` `inventoryAuthUsers()`.

```js
const isSuper =
  claims.super_admin === true ||
  doc.IsAdmin === true ||
  doc.isAdminRule === 1;
if (isSuper) role = 'SUPERADMIN';
```

For this UID:

| Evidence | Value |
|---|---|
| Auth `customClaims` (auth_users_export) | `{}` |
| Inventory entry | `role=SUPERADMIN`, `functional_test=false`, `preserve=true` |
| AUTH_PRESERVE_UIDS | includes this UID |

**Therefore SUPERADMIN was derived from Firestore `user/{uid}` fields  
`IsAdmin===true` and/or `isAdminRule===1`, not from Auth custom claims.**

Independent corroboration (Admin panel create path):

- `admin_audit_log` backup entry: `target_type="super_admin"`, `action="create"`,  
  `target_id=ZA8yOrIEYIZnmXx85ja9yyctIJu1`
- `admin_add_super_admin_widget.dart` writes `IsAdmin: true`,  
  `isAdminRule: AdminRoleService.ruleSuperAdmin` (=1) and audits `targetType: 'super_admin'`
- `panel_claims.js` / `AdminRoleService`: same Firestore rule matrix  
  (`isAdmin`/`IsAdmin`/`isAdminRule=1` → super_admin)

---

## 3. Authoritative role evidence source

| Priority | Source | Used offline? |
|---|---|---|
| **1 (authoritative for inventory)** | Firestore `user/{uid}`: `IsAdmin` / `isAdmin` / `isAdminRule` / `IsAdminRule` / agent+partner flags | **Yes** — Driver mapper |
| 2 (corroboration) | `admin_audit_log.target_type=super_admin` | Offline evidence only (no N+1 in live query) |
| 3 (insufficient alone) | Auth `customClaims` | **Not** used for Driver exclusion (may be `{}`) |

Admin Next Driver classification does **not** call Auth Admin. It mirrors the Legacy  
inventory Firestore branch so empty claims cannot hide SUPERADMIN.

---

## 4. Final Driver membership predicate

```
isDriverCandidate =
  data.ismndob === true || data.ismndom === true   // proven typo alias

isKnownAdministrativeIdentity =
  IsAdmin/isAdmin || isAdminRule/IsAdminRule ∈ {1,2,3,4,5}
  || IsAgent/isagent || is_partner/isPartner
  → roles: SUPERADMIN | FINANCE | COUNTRY_ADMIN | PARTNER | TRANSPORT_MANAGER

hasProvenDriverRoleEvidence =   // pre_reset_inventory isDriver + UserRecord
  registration_status != null
  || actev_mndob === true
  || registration_flow_version != null
  || mndobTypeCar != null
  || mndob_type_car != null

isOperationalDriver =
  isDriverCandidate && !isKnownAdministrativeIdentity && hasProvenDriverRoleEvidence
```

**Query (unchanged, safe):** Firestore `user` where `ismndob==true`, orderBy  
`created_time` desc, `limit≤50` → map → role classify → geography only for  
operational Drivers.

Module: `src/domain/driver/DriverRoleClassification.ts`

---

## 5. Why `ismndob` alone is insufficient

Admin list uses `ismndob==true` as a **candidate** filter on the shared `user`  
collection. Super-admin create does not clear that flag; a panel user can match the  
driver query without being an operational Driver. Inventory itself did **not** use  
`ismndob` for DRIVER — it used registration / `actev_mndob` / flow / car type, and  
ranked SUPERADMIN first.

---

## 6. Why Auth claims alone are insufficient

Auth export for this UID has `customClaims: {}`. Inventory still labeled SUPERADMIN  
via Firestore `IsAdmin` / `isAdminRule`. Claims sync (`panel_claims.js`) is  
best-effort; empty claims must not force Driver geography classification.

---

## 7. Classification for admin contamination

| Status | Meaning |
|---|---|
| **`excludedNonDriver`** | Candidate matched but known administrative identity |
| `testOrNoncanonical` | Unchanged markers (cp5_/test_/demo_/qa_/golden_, flags, …) |
| `unmappedCountry` / `unmappedCity` | **Only** after `isOperationalDriver` |
| `malformed` | Candidate, not admin, missing proven driver-role evidence (or conflicting registration) |

Geography for `excludedNonDriver` is `countryMapping/cityMapping=excludedNonDriver`  
(`not_applicable` to Driver geo gates). Missing `Rev_dolh` on SUPERADMIN does **not**  
increment `unmappedCountry`.

---

## 8. Metrics reconciliation

```
recordsRead
  = validMapped
  + testOrNoncanonical
  + excludedNonDriver
  + unmappedCountry
  + unmappedCity
  + malformed
  + unknownDiscriminator
```

Also tracked: `driverCandidates`, `conflictingRegistration`,  
`activeOperationalDuplicates` (operational Auth UID collisions),  
`unexpectedCollections` (0 for `user`-only query).

`reconcileDriverAuditPartition()` asserts the sum.

Expected post-fix live shape (from prior 11 rows, if SUPERADMIN still has  
`IsAdmin`/`isAdminRule=1` on the doc):

| Metric | Prior | Expected |
|---|---|---|
| recordsRead | 11 | 11 |
| validMapped | 5 | 5 |
| testOrNoncanonical | 5 | 5 (unchanged) |
| unmappedCountry | **1** | **0** |
| excludedNonDriver | 0 | **1** |

---

## 9. Auth UID / role separation + safe diagnostics

- `authUid` / `authUidKnowledge` remain identity fields only.  
- A `uid` equal to a known SUPERADMIN document id does **not** grant admin role.  
- Role comes only from Firestore admin/driver fields above.

Safe diagnostic fields (no PII):

`sourceDocumentId`, `driverCandidate`, `authoritativeRole`, `roleEvidenceKind`,  
`mappingStatus`, `countryMapping`, `cityMapping`, source country/city paths/ids,  
`registrationStatus`, `testClassification`.

---

## 10. Closing gate

**Still block:** `unmappedCountry`, `unmappedCity`, `malformed`,  
`conflictingRegistration`, `activeOperationalDuplicates`,  
`exactDocumentIdDuplicates`, `unknownDiscriminator`, `unexpectedCollections`,  
`productionWrites`, exclusions **without** authoritative role evidence.

**Do not block close:** `excludedNonDriver > 0` when each exclusion has  
authoritative role evidence (`excludedNonDriverHasAuthoritativeEvidence`).

---

## 11. Tests

| Area | Coverage |
|---|---|
| Inventory SUPERADMIN from `IsAdmin` / `isAdminRule=1` without claims | unit |
| Affected id → `excludedNonDriver`, not `unmappedCountry` | unit |
| `ismndob` alone → `malformed` | unit |
| Operational Driver missing country → still `unmappedCountry` | unit |
| Membership predicate | unit |
| Close gate: exclusion w/ evidence OK; unmappedCountry blocks | unit |
| Partition reconcile | unit |
| Auth UID ≠ role | unit |
| Repository list classification | unit |
| Retained: live flag helper, write trap, kill switch, resource gate, page cap≤50 | unit + live harness always-on |

### Results

| Gate | Result |
|---|---|
| Phase 4A-5 unit | **47** passed |
| Phase 4A-5 live harness always-on | **5** passed (live body skipped) |
| Phase 4A-5 slice | **52** |
| Full suite | **455 passed \| 2 skipped** |
| typecheck | **PASS** |
| build | **PASS** |
| Production calls | **0** |
| Production writes | **0** |

---

## 12. Files touched

- `src/domain/driver/DriverRoleClassification.ts` (new)
- `src/domain/driver/mapCanonicalDriverRead.ts`
- `src/domain/driver/DriverMappingDiagnostic.ts`
- `src/domain/driver/DriverDuplicateIdentityAudit.ts`
- `src/domain/canonical/CanonicalReadModels.ts`
- `src/infrastructure/production/repositories/FirebaseProductionDriverReadRepository.ts`
- `src/test/unit/phase4a5-drivers-readiness.test.ts`
- `src/test/live/phase4a5-live-drivers.shadow.test.ts`
- `docs/PHASE_4A_5_DRIVER_ROLE_CONTAMINATION_FIX_REPORT.md` (this file)

Hard bans respected: no country/city assign, no geo alias, no test reclassification of  
the five existing markers, no Production calls/writes, no UID one-off hardcode as the  
sole rule (fixture uses the id only as a regression case; classification is field-based).

---

## GO / NO-GO for one final Drivers live verification

```
CONDITIONAL GO — role contamination excluded offline;
operator PHASE4A5_LIVE_DRIVERS=1 required to confirm
excludedNonDriver (SUPERADMIN) + unmappedCountry=0 + partition reconcile;
then close Drivers if remaining gates clean.
```

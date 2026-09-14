# TOURI TAXI ADMIN NEXT — PHASE 5M PERMISSION DENIED ROOT CAUSE REPORT

**Date:** 2026-09-13  
**Project:** `/Users/ventura/touri-admin-next`  
**Mode:** Inspect + offline code fix only  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**IAM changes this session:** **0**  
**Driver mutation:** **NO**  
**Finance:** **NO**  
**Apply rerun:** **NO**

Evidence source: `.local/phase5m-driver-pilot/apply-safe-summary.json` from the failed armed attempt.

---

## Executive verdict

| Field | Value |
|---|---|
| Exact failing stage | **AUDIT_INTENT** (first write) |
| Exact API operation | Firebase Admin `DocumentReference.create()` on `admin_next_cw_audit/{auditId}` |
| Exact principal | ADC `application_default` via named Admin app `phase5m-driver-pilot-apply` (impersonated SA policy) |
| Project / database | `tutorial-multi-language-70gx4j` / `(default)` |
| IAM vs Security Rules | **IAM** (Admin SDK — Security Rules do not apply) |
| Missing permission (most likely) | Effective `datastore.entities.create` for that create RPC (or grant not bound to the write principal) |
| Why 4/4 preflight insufficient | CRM `testIamPermissions` ≠ live Firestore RPC proof; failure summary also dropped `iamPreflightStatus` |
| GO/NO-GO for one final retry | **NO-GO** until temporary create+update IAM is re-granted to the **exact ADC principal**, harness shows `iamPreflightStatus=IAM_PREFLIGHT_PASS` with `iamGranted`/`iamMissing` populated, then one armed retry |

---

## 1. Mechanism trace (each stage)

Pipeline order (`executeDriverControlledWrite`):

verified actor → RBAC → load → scope → precondition → **idempotency GET** → **AUDIT_INTENT create** → **domain update** → **idempotency PUT** → **AUDIT_RESULT create** → CF claims

| Stage | Repository / adaptor | SDK | Credential / principal | Project | Database | Path | API method | Required IAM | Rules? |
|---|---|---|---|---|---|---|---|---|---|
| Load / scope | `Phase5M` loadPort / `getUserDoc` | **firebase-admin** Firestore | ADC `applicationDefault()` on app `phase5m-driver-pilot-apply` | `tutorial-multi-language-70gx4j` | `(default)` | `user/{uid}` | `DocumentReference.get` | `datastore.entities.get` | **IAM** (not Rules) |
| Idempotency GET | `Phase5MFirestoreIdempotencyStore.get` | firebase-admin | same singleton / ADC | same | `(default)` | `admin_next_cw_idempotency/{key}` | `DocumentReference.get` | `datastore.entities.get` | **IAM** |
| **AUDIT_INTENT** | `Phase5MFirestoreAuditPort.recordIntent` | firebase-admin | same | same | `(default)` | `admin_next_cw_audit/{auditId}` | **`DocumentReference.create`** | **`datastore.entities.create`** | **IAM** |
| Driver domain | `Phase5MControlledDriverWriteRepository.apply` | firebase-admin | same | same | `(default)` | `user/{uid}` | `runTransaction` + `Transaction.update` | `datastore.entities.get` + `datastore.entities.update` | **IAM** |
| Idempotency PUT | `Phase5MFirestoreIdempotencyStore.put` | firebase-admin | same | same | `(default)` | `admin_next_cw_idempotency/{key}` | `create` then `set(merge)` | create then update | **IAM** |
| AUDIT_RESULT | `Phase5MFirestoreAuditPort.recordResult` | firebase-admin | same | same | `(default)` | `admin_next_cw_audit/{auditId}` | `DocumentReference.create` | `datastore.entities.create` | **IAM** |
| Claims verify | `auth.getUser` | firebase-admin Auth | same | same | n/a | Auth user | `getUser` | `firebaseauth.users.get` | Auth IAM |
| Claims write | CF `syncUserClaimsOnWrite` | CF runtime SA | **not** operator ADC | same | n/a | Auth claims | `setCustomUserClaims` | `firebaseauth.users.update` on CF SA | n/a |

**Not used on this path:** Firebase client SDK → Firestore Security Rules.

---

## 2. Credential consistency

| Check | Result |
|---|---|
| Shared Admin app singleton | Yes — `phase5m-driver-pilot-apply` for audit + driver + idempotency |
| Credential provider | `admin.credential.applicationDefault()` after `ApplicationDefaultProductionCredentialProvider` gate (ADC only; `GOOGLE_APPLICATION_CREDENTIALS` refused) |
| Project ID | `PHASE_5M_EXPECTED_PROJECT_ID` = `tutorial-multi-language-70gx4j` |
| Database ID | `(default)` via `admin.firestore(app)` — no named DB |
| Accidental client SDK | **No** |
| Emulator / stale alternate app | Named app reused if already init; same ADC chain — no evidence of client/emulator path |
| IAM preflight principal | Separate `GoogleAuth` ADC client for CRM `testIamPermissions` — **same ADC chain intended**, but policy-check only |

---

## 3. Evidence from failed attempt

From `.local/phase5m-driver-pilot/apply-safe-summary.json`:

```text
overallStatus = PHASE5M_DRIVER_PILOT_WRITE_NO_GO
actorVerified = true
actorRole = super_admin
targetFound / synthetic / operationalDriver = true
currentState = pending_review
applyAttempted = true
denials = [INTERNAL_WRITE_FAILURE]
blocker = "7 PERMISSION_DENIED: Missing or insufficient permissions."
actual*Writes = all 0
iamPreflightStatus = null   ← observability bug
iamGranted = []
iamMissing = []
```

Interpretation:

1. Reads + pilot gates succeeded (target qualified, actor verified).
2. First **write** failed before any counter increment → **AUDIT_INTENT `create`**.
3. Raw Admin/gRPC denial was wrapped as generic `INTERNAL_WRITE_FAILURE`.
4. Failure summary **omitted** IAM fields even though harness IAM likely ran earlier (`!iam.ok` would have stopped before apply).

---

## 4. Why previous 4/4 `testIamPermissions` was insufficient

1. **CRM policy check ≠ Firestore RPC proof.** `projects.testIamPermissions` returns whether IAM policy lists the permission for the caller; it does not execute `DocumentReference.create`.
2. **Observability gap.** `!applyOutcome.ok` path did not copy `iamPreflightStatus` / `iamGranted` / `iamMissing`, so the armed failure report showed `null` and could not prove in-harness IAM PASS at write time.
3. **Possible principal / binding mismatch** (not re-probed this session): temporary grant may have been attached to a different member than the ADC impersonated SA used by Admin SDK.
4. **No additional permission proven** beyond the derived quartet. Do **not** recommend Editor / Owner / `datastore.user` / `firebaseauth.admin` shortcuts. If create remains denied after a correct create grant on the write principal, re-diagnose with stage classification (now shipped) before broadening.

Derived operator permissions remain:

- `datastore.entities.get`
- `datastore.entities.update`
- `datastore.entities.create`
- `firebaseauth.users.get`

---

## 5. Code fixes shipped (offline)

| Fix | Location |
|---|---|
| Stage classification | `Phase5MPermissionDeniedClassification.ts` → `AUDIT_INTENT_PERMISSION_DENIED` \| `DRIVER_DOMAIN_PERMISSION_DENIED` \| `IDEMPOTENCY_PERMISSION_DENIED` \| `AUDIT_RESULT_PERMISSION_DENIED` |
| Adapter wrapping | `Phase5MProductionWriteAdapters.ts` — each stage uses `withPhase5MStagePermissionDenied` (no retry; safe gRPC label only) |
| Error catalogs | `DriverWriteErrors.ts`, `ControlledWriteErrorCatalog.ts` |
| IAM hard gate + fields | `Phase5MDriverPilotApply.ts` — IAM null/skip/`!ok` → `applyAttempted=false`, writes=0; all write/deny paths populate `iamPreflightStatus`/`iamGranted`/`iamMissing` via `phase5MIamSummaryFields` |
| Fake stage failures | `Phase5MFakePorts.ts` + unit tests |

---

## 6. Offline verification

| Check | Result |
|---|---|
| `npm test` | **PASS** — 1035 passed \| 2 skipped |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Offline coverage includes independent stage PD classification and IAM skip → zero writes.

---

## 7. GO / NO-GO for one final Phase 5M retry

**NO-GO now.**

Before one final armed retry (operator-owned; not this session):

1. Re-grant **only** temporary least-privilege create+update (and keep get) to the **exact ADC impersonated SA** used by Admin SDK.
2. Confirm harness summary: `iamPreflightStatus=IAM_PREFLIGHT_PASS`, non-empty `iamGranted`, empty `iamMissing` **before** any write.
3. Expect denial code (if still failing) to be stage-scoped, not `INTERNAL_WRITE_FAILURE`.
4. Keep Finance / Agent / Customer / Auth-fixture write flags false.
5. Do not blind-retry if any domain write counter becomes non-zero.

After those conditions: **CONDITIONAL GO** for exactly one Phase 5M apply.

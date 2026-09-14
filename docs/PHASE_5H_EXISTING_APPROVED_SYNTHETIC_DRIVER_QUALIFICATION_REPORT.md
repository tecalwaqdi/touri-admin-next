# TOURI TAXI ADMIN NEXT — PHASE 5H EXISTING APPROVED SYNTHETIC DRIVER QUALIFICATION REPORT

**Date:** 2026-09-13  
**Phase:** 5H pivot — Existing Approved Synthetic Driver Pilot Qualification  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** READ-ONLY qualification + offline contracts  
**Live Production dry-run this session:** **NOT RUN** (explicit STOP)  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Suspend executed:** **NO**  
**Rollback executed:** **NO**  
**Fixture created:** **NO**  
**Auth user created:** **NO**  
**Write flags enabled:** **NO** (all remain false)  
**Finance started:** **NO**

---

## Context

Phase 5G live inventory:

```text
syntheticDriversFound = 5
approved = 1
unknown = 4
safePilotCandidates = 0
recommendation = PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE
```

Phase 5H fixture path: `FIXTURE_CREATION_NO_GO` (`AUTH_REQUIRED_FOR_FIXTURE` + `syncUserClaimsOnWrite`).

This pivot evaluates the **ONE** existing proven synthetic with `registrationStatus=approved` for `approved→suspended` (rollback `suspended→approved`) without executing either write.

---

## Safe target ID

```text
safeTargetId = PENDING_OPERATOR
```

Phase 5G live safe observability (`inventory-safe-summary.json`) records aggregates only when `recommendedTargetId=null` (no SAFE candidate). Exact approved synthetic document id was **not** persisted in the safe summary (by design — no PII / no inventory dump).

Offline qualification uses Phase 5G selection rules + suspend/rollback contracts. No silent fallback to another Driver / unknown-state record.

Operator may re-run Phase 5G inventory read-only to capture the approved synthetic id for a future **read-only** dry-run — Auth NO-GO still applies.

---

## Synthetic proof

Offline representative (selection rules only — not a live target):

| Gate | Result |
|---|---|
| Proven markers | `documentId_prefix` (`test_`) **or** `is_test` / `functional_test` / `qa_fixture` |
| Fuzzy name/email/phone | **forbidden** |
| `excludedUnknownIdentity` | **never** reclassified |
| Live approved=1 | Must pass same Phase 5G evidence classifier; else `PILOT_TARGET_NOT_SYNTHETIC` |

---

## Current state (offline / operator)

| Axis | Offline | Live approved (operator) |
|---|---|---|
| registrationStatus | PENDING_OPERATOR | must be `approved` |
| operationalDriver | PENDING_OPERATOR | required `true` |
| authoritativeRole | PENDING_OPERATOR | required `driver` |
| conflictingRole | PENDING_OPERATOR | required `false` |
| accountEnabled | PENDING_OPERATOR | typically `enabled` when `actev_mndob=true` |

Phase 5G note: even when base-eligible, **suspend** ranks `ACCEPTABLE_WITH_CAUTION` (not `SAFE`). Only `pending_review→needs_changes` ranks `SAFE` — explains `safePilotCandidates=0`.

---

## Active-trip assessment

Canonical trip logic (reuse 4A-5 / 5G): `on_trip` / `mndon_newacc` → `idle|busy|unknown`.

| Required | Value |
|---|---|
| hasActiveTrip | `false` |
| tripState | `idle` |
| Else | `DRIVER_HAS_ACTIVE_TRIP` NO-GO |

Unknown trip fails closed (same as Phase 5G).

---

## Finance assessment (read-only)

| Required | Value |
|---|---|
| pendingSettlement | `false` |
| payoutDependency | `none` |
| walletMutationRequired | `false` |
| financialImpact | `none` |
| Unknown / present | NO-GO |

Classifier: `Phase5GFinanceSafetyClassification` (Outstandingonlinepayment / bank fields). No Finance writes.

---

## Auth assessment — decisive NO-GO

```text
authImpact = present
authWritesExpected = 1   (required = 0)
AUTH_SIDE_EFFECT_PRESENT = true
```

**Evidence (Legacy READ-ONLY, ara-ban):**

`admin/Admi/firebase/functions/index.js` — `syncUserClaimsOnWrite` on `user/{uid}`:

- Fires on **any** create/update where `after.exists`
- Always calls `admin.auth().setCustomUserClaims(uid, claims)`
- `panel_claims.js` `deriveClaimsFromUserData` does **not** read `registration_status` / `actev_mndob`, but Auth write still occurs
- If document id ≠ real Auth UID → `auth/user-not-found` (uncontrolled CF failure)

Same trigger proven in Phase 5H fixture analysis for CREATE; UPDATE path is identical for `after.exists`.

Correction vs `AUTH_REQUIRED_FOR_PILOT_TARGET=false` (5E/5F Firestore-path claim): Controlled Write code path does not call Auth directly, but **Production CF still does** on the domain write.

---

## Cloud Function side-effect classification

| Export | On registration_status update? | Class |
|---|---|---|
| **syncUserClaimsOnWrite** | **YES** | **high-risk** (Auth) |
| refreshMyClaims | no | none / harmless |
| notifyAdminsDriverApplication | no | none / harmless |
| adminAdjustDriverWallet | no | none (no auto finance) |
| ensureMkanListVisibilityOnWrite | no (mkan only) | none |

Uncontrolled Auth → NO-GO. No Finance/Trip auto-writes on this patch.

---

## Exact suspend diff (approved → suspended)

```text
action = suspend
from = approved
to = suspended
patch = { registration_status: "suspended" }
allowlistedFields = ["registration_status"]
arbitraryPayloadAllowed = false
idempotencyKey = phase5h_existing_approved_suspend_v1
```

**Not** in Production allowlist: `actev_mndob` (Fake repo flips `accountEnabled` in-memory only). Availability impact = `registration_status` suspended only.

---

## Exact rollback diff (suspended → approved)

```text
action = approve
from = suspended
to = approved
patch = { registration_status: "approved" }
allowlistedFields = ["registration_status"]
idempotencyKey = phase5h_existing_approved_rollback_approve_v1
approvalRevalidationRequired = false
rollbackSupported = true
rollbackSafe = false   ← Auth side effect on rollback
```

Separate idempotency keys (suspend ≠ rollback).

---

## Real-user impact / RBAC / precondition / audit

| Axis | Value |
|---|---|
| realUserImpact | PENDING_OPERATOR (offline); `none` only if live proven synthetic + mapped country |
| RBAC | `super_admin` + `drivers:approve` |
| Scope | super_admin unscoped / in-scope |
| Precondition | expectedCurrentState=`approved`; token captured as boolean only — **raw token not exposed** |
| Audit | intent before write + result after; no PII |

---

## Expected future write counts (hypothetical — NOT authorized)

| Surface | Suspend | Rollback | This session |
|---|---|---|---|
| domainWrites | 1 | 1 | **0** |
| auditWrites | 2 | 2 | **0** |
| idempotencyWrites | 1 | 1 | **0** |
| triggerSideEffectWrites | 1 | 1 | **0** |
| authWrites | **1** | **1** | **0** |
| financeWrites | 0 | 0 | **0** |
| tripWrites | 0 | 0 | **0** |

`authWrites≥1` fails required `authWritesExpected=0`.

---

## Dry-run readiness

```bash
PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN=1 \
  npx vitest run src/test/live/phase5h-existing-approved-driver-qualification.test.ts
```

| Flag | Behavior |
|---|---|
| unset / ≠1 | **SKIP** |
| `=1` | Offline plan dry-run; `actualWrite=false`; `wouldWrite=false`; still **NO_GO** on Auth |

Default SKIP. Do **not** auto-run live Production dry-run. Do **not** execute suspend/rollback.

---

## Tests / typecheck / build

| Check | Result |
|---|---|
| `src/test/unit/phase5h-existing-approved-synthetic-driver-qualification.test.ts` | **16 passed** |
| `src/test/live/phase5h-existing-approved-driver-qualification.test.ts` | **1 passed** (SKIP path) |
| `npm test` | **PASS** — **885 passed \| 2 skipped (887)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Coverage: write-flag guards, env exact-1, synthetic gate, trip/finance NO-GO, Auth `syncUserClaimsOnWrite`, exact suspend/rollback diffs, separate idempotency keys, future write counts, offline PENDING_OPERATOR, live-shaped still Auth NO-GO, dry-run zeros, no silent fallback.

---

## Write flags (remain false)

```text
GLOBAL_PRODUCTION_WRITE_ENABLED = false
PRODUCTION_WRITE_ENABLED = false
DRIVER_WRITE_ENABLED = false
AGENT_WRITE_ENABLED = false
CUSTOMER_WRITE_ENABLED = false
CUSTOMER_AUTH_WRITE_ENABLED = false
FINANCE_WRITE_ENABLED = false
```

---

## Qualification score /100

**30 / 100**

Contracts, diffs, harnesses, and offline gates are complete. Decisive Auth CF side effect + rollbackUnsafe + pending live target id keep the score low.

---

## GO | CONDITIONAL GO | NO-GO

### for ONE read-only Production dry-run against the existing approved synthetic Driver

**NO-GO**

```text
EXISTING_APPROVED_SYNTHETIC_PILOT = NO_GO
primaryCode = AUTH_SIDE_EFFECT_PRESENT
recommendation = AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING
silentFallbackToOtherDriver = false
```

Conditions that remain blocked even after operator captures the live approved id:

1. `syncUserClaimsOnWrite` ⇒ Auth write on suspend **and** rollback  
2. Required `authImpact=none` / `authWritesExpected=0` fails  
3. `rollbackSafe=false`  
4. Phase 5G suspend rank is caution-only (not SAFE)

### Also NO-GO

- Suspend execution  
- Rollback execution  
- Fixture create / Auth create  
- Write-flag enablement  
- Finance  
- Silent fallback to unknown=4 or any real Driver  

---

## Artifacts

| Path | Role |
|---|---|
| `Phase5HExistingApprovedDriverAuthImpact.ts` | Auth / CF update-path analysis |
| `Phase5HExistingApprovedDriverDiffContract.ts` | Exact suspend/rollback allowlists + write counts |
| `Phase5HExistingApprovedDriverQualification.ts` | Qualification gates + verdict |
| `Phase5HExistingApprovedDriverDryRun.ts` | Dry-run planner (`actualWrite=false`) |
| `isPhase5HExistingApprovedDriverDryRunEnabled.ts` | Env gate |
| `src/test/unit/phase5h-existing-approved-synthetic-driver-qualification.test.ts` | Offline units |
| `src/test/live/phase5h-existing-approved-driver-qualification.test.ts` | SKIP / optional dry-run harness |
| `docs/PHASE_5H_EXISTING_APPROVED_SYNTHETIC_DRIVER_QUALIFICATION_REPORT.md` | This report |

---

## Closing posture

```text
EXISTING_APPROVED_SYNTHETIC_PILOT = NO_GO
recommendation = AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING
productionWritesThisSession = 0
authWritesThisSession = 0
financeWritesThisSession = 0
tripWritesThisSession = 0
suspendExecuted = false
rollbackExecuted = false
```

**STOP.** No suspend. No rollback. No fixture. No Auth create. No write flags. No Finance.

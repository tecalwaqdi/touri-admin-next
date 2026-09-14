# TOURI TAXI ADMIN NEXT — PHASE 5M FIRST CONTROLLED PRODUCTION DRIVER WRITE PREPARATION REPORT

**Date:** 2026-09-13  
**Phase:** 5M First Controlled Production Driver Write Preparation  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENT AND PREPARE — **NO real Pilot write**  
**Production calls this session:** IAM check-only + prior Phase 5L reads only  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**IAM changes this session:** **0**  
**Finance started:** **NO**  
**Phase 5J create IAM restored:** **NO**

---

## Goal

Prepare a real operator apply harness for ONE controlled Driver Pilot write:

```text
pending_review → needs_changes
via RequestDriverChangesCommand → executeDriverControlledWrite
```

Target UID **only** from `.local/phase5j-fixture/registry.json` (synthetic + operational + pending_review). No search / fallback / arbitrary UID shell input.

---

## Exact target / action

| Field | Value |
|---|---|
| Registry | `.local/phase5j-fixture/registry.json` only |
| Action | `RequestDriverChangesCommand` (`needs_changes`) |
| Transition | `pending_review → needs_changes` |
| Actor | `FIREBASE_ID_TOKEN` → `resolveProductionVerifiedActor` → `super_admin` |
| Pipeline | operator → verified actor → RBAC → scope → precondition → transition → idempotency → audit intent → controlled repo → audit result |

**Not** direct Firestore from harness.

---

## Exact domain diff

```json
{ "registration_status": "needs_changes" }
```

Unexpected keys → **`PILOT_DIFF_VIOLATION`** (fail-closed).  
Forbidden surfaces unchanged: `actev_mndob`, wallet/earnings, trip, country/city, documents, Auth disabled, claims semantics.

---

## Exact operator IAM permissions required

Derived from adapter operations (`Phase5MIamDerivation.ts`) — not assumed:

| Permission | Why (adapter proof) |
|---|---|
| `datastore.entities.get` | Driver load / txn re-read / idempotency get |
| `datastore.entities.update` | `user/{uid}` allowlisted update + idempotency second put |
| `datastore.entities.create` | Audit INTENT + RESULT create; idempotency first put |
| `firebaseauth.users.get` | Bounded post-write claim verify |

**Not required on operator ADC:** `firebaseauth.users.update`  
(`operatorAuthWritePermissionRequired=false` — CF owns claims).

Collections:

- `user/{uid}` — update only  
- `admin_next_cw_audit/{id}` — create  
- `admin_next_cw_idempotency/{key}` — create then update  

Reads stay on existing `roles/datastore.viewer` + `roles/firebaseauth.viewer`.

---

## Already granted / missing (real check-only preflight)

`projects.testIamPermissions` this session (`mutationsPerformed=0`, `iamChanges=0`):

| Permission | Result |
|---|---|
| `datastore.entities.get` | **PASS** (granted) |
| `firebaseauth.users.get` | **PASS** (granted) |
| `datastore.entities.update` | **MISSING** |
| `datastore.entities.create` | **MISSING** |

```text
status = IAM_PREFLIGHT_FAILED
missing = [datastore.entities.update, datastore.entities.create]
```

---

## Auth trigger ownership

| Field | Value |
|---|---|
| `authClaimWrites` | **1** |
| Writer | Production CF `syncUserClaimsOnWrite` → `setCustomUserClaims` |
| Operator ADC Auth write | **not required** |
| `expectedClaimsChange` | **false** (payload stays `{ country_id }` only) |
| Bounded verify | operator `getUser` only |

---

## Exact expected write counts

| Surface | Count |
|---|---|
| `driverDomainWrites` | **1** |
| `auditIntentWrites` | **1** |
| `auditResultWrites` | **1** |
| `idempotencyWrites` | **1** (logical surface) |
| `authClaimWrites` | **1** (CF) |
| finance / trip / agent / customer | **0** |

---

## Apply harness / idempotency / audit / partial failure / post-write verification

### Gates

```text
PHASE5M_DRIVER_PILOT_APPLY=1
GLOBAL_PRODUCTION_WRITE_ENABLED=true
PRODUCTION_WRITE_ENABLED=true
DRIVER_WRITE_ENABLED=true
AGENT/CUSTOMER/CUSTOMER_AUTH/FINANCE/SYNTHETIC_AUTH_FIXTURE=false
```

Not Phase 5J provision gates. Global Vitest sanitization clears write flags; only `phase5m-driver-pilot-apply.test.ts` restores inline gates when armed.

### Idempotency

Key: `phase5l_driver_needs_changes_pilot_v1`  
Already applied → **`PILOT_ALREADY_APPLIED`** — never apply twice.

### Audit / write order (fail-closed)

```text
verified_actor → rbac → scope → precondition_transition →
idempotency_get → audit_intent → controlled_repo_domain_update →
idempotency_put → audit_result → syncUserClaimsOnWrite_setCustomUserClaims
```

No domain write without AUDIT_INTENT.

### Before-state

Re-read + precondition token; drift → **`PILOT_PRECONDITION_FAILED`**.

### Partial failure (§20)

Committed domain write → **no blind retry** (`DOMAIN_COMMITTED_*`, Auth verify fail, `PILOT_ALREADY_APPLIED`).

### Post-write

- `registration_status=needs_changes`
- Forbidden fields unchanged
- Bounded Auth claim verify
- Side effects finance/trip/agent/customer = 0
- Success: `PHASE5M_DRIVER_PILOT_WRITE_PASS` + `pilotWriteProven=true`

### Temporary custom role PLAN only

```text
roleId (plan): touriPhase5mDriverPilotWrite
includedPermissions: datastore.entities.update, datastore.entities.create
createRole=false, grantRole=false
avoid: editor / datastore.user / firebaseauth.admin
```

**Do not create/grant in this session.**

---

## Architecture note (hard locks)

Global Phase 5A/5D Production hard-locks remain **false**. Phase 5M uses `executeDriverControlledWrite` with Pilot-gated adapters (`Phase5MControlledDriverWriteRepository`) after Phase5M gates + IAM pass — those gates are the Production enablement for this single path. Facade `CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled` stays **false**.

---

## Tests / typecheck / build

| Check | Result |
|---|---|
| Phase 5M unit | **21 passed** |
| Phase 5M live harness | **3 passed** (SKIP default) |
| `npm test` | **PASS** — **1018 passed \| 2 skipped (1020)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Artifact: `.local/phase5m-driver-pilot/apply-safe-summary.json`

---

## Write safety this session

```text
Production writes = 0
IAM changes = 0
Auth claim writes = 0
Finance / Trip / Agent / Customer writes = 0
PHASE5M_DRIVER_PILOT_APPLY not armed
```

---

## GO / CONDITIONAL GO / NO-GO

### 1. temporary least-privilege IAM grant

**CONDITIONAL GO** — operator may temporarily grant a custom role with **only**:

```text
datastore.entities.update
datastore.entities.create
```

to the existing ADC identity. Prefer not broad editor/datastore.user/firebaseauth.admin. Do **not** grant `firebaseauth.users.update`. **Not performed this session.**

### 2. IAM re-check

**GO** — after grant, re-run check-only `runPhase5MIamPreflight`. Expect `IAM_PREFLIGHT_PASS` with `missing=[]`. Mutations must remain 0.

### 3. ONE Phase 5M real Driver Pilot write

**CONDITIONAL GO** — only after (1)+(2) PASS, with all Phase 5M gates + `FIREBASE_ID_TOKEN` super_admin + registry target still `pending_review` synthetic operational. Expect `PHASE5M_DRIVER_PILOT_WRITE_PASS` + `pilotWriteProven=true` and `driverDomainWrites=1`.

### This preparation session

**NO-GO for execution** — harness prepared; IAM grant / real Pilot / Finance **not** authorized / **not** run.

---

## Artifacts

| Path | Role |
|---|---|
| `Phase5MDriverPilotApply.ts` | Apply orchestrator |
| `Phase5MProductionWriteAdapters.ts` | ADC controlled repo + audit + idempotency |
| `Phase5MIamDerivation.ts` / `Phase5MIamPreflight.ts` / `Phase5MIamRolePlan.ts` | IAM proof + check-only + plan |
| `phase5m-driver-pilot-apply.test.ts` (live) | SKIP-default harness |
| `phase5m-driver-pilot-apply.test.ts` (unit) | Offline §24 |
| `docs/PHASE_5M_FIRST_PRODUCTION_DRIVER_WRITE_PREPARATION_REPORT.md` | This report |

---

## STOP

No real Pilot. No IAM grant. No Finance. No Phase 5J create IAM restore.

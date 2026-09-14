# TOURI TAXI ADMIN NEXT — PHASE 5J SYNTHETIC DRIVER PROVISIONING IMPLEMENTATION REPORT

**Date:** 2026-09-13  
**Phase:** 5J Auth-Safe Synthetic Driver Provisioning Implementation  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENTATION ONLY — **NOT EXECUTED**  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Auth user created:** **NO**  
**Firestore fixture created:** **NO**  
**Write flags enabled:** **NO**  
**Pilot executed:** **NO**  
**Finance started:** **NO**

---

## Context

Phase 5I plan-only dry-run PASSED with `DESIGN_SESSION` hard lock (`provisioningWouldBePossible=false`). Phase 5J implements the real operator-only Auth-safe provisioning path:

```text
disabled synthetic Auth create → UID → create-only user/{uid} Driver
  → unmodified syncUserClaimsOnWrite
  → verify claims { country_id: countries/saudi_arabia } only
  → verify canonical Driver state
  → pilot_ready only if all pass
```

**STOP honored:** No live Auth create. No Firestore fixture. No Pilot. No Finance.

---

## real provisioning implementation

| Artifact | Role |
|---|---|
| `ProvisionSyntheticDriverFixtureCommand` | Typed allowlist command (no arbitrary payload; NOT Admin UI) |
| `SyntheticDriverProvisioningService.provision()` | Gated orchestration (async) |
| `Phase5JFirebaseAdapters` | Real Admin Auth+Firestore — unreachable without ALL gates |
| `Phase5JFakePorts` | Unit-test doubles |
| `dryRun()` | Phase 5I plan-only path **untouched** (writes = 0) |

Default service has **no ports** → even with open gates returns `PROVISIONING_PORTS_UNAVAILABLE` (fail closed until adapters explicitly injected).

---

## operator gates

**ALL required** for real provision:

```text
PHASE5I_PROVISION_SYNTHETIC_DRIVER=1
SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=true
GLOBAL_PRODUCTION_WRITE_ENABLED=true
PRODUCTION_WRITE_ENABLED=true
DRIVER_WRITE_ENABLED=true
EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j
```

**Must remain false:** `AGENT_WRITE_ENABLED`, `CUSTOMER_WRITE_ENABLED`, `CUSTOMER_AUTH_WRITE_ENABLED`, `FINANCE_WRITE_ENABLED`

| Condition | Code |
|---|---|
| Any required missing/false | `PROVISIONING_WRITE_DISABLED` |
| Forbidden surface true | `UNSAFE_WRITE_CONFIGURATION` |
| Project mismatch | `PROJECT_ID_MISMATCH` |

Live harness arm: `PHASE5J_PROVISION_SYNTHETIC_DRIVER=1` (exact). Preserved through Vitest sanitization like 5G/5I dry-run. **Write-enabling flags are never preserved.**

---

## Auth create contract

```text
auth.createUser({ disabled: true })
```

- No email / phone / password / displayName / photoURL
- Auth-generated UID
- Post-create verify: `disabled=true`, no email/phone
- Safe summary only (uid + disabled + null contacts)
- **One Auth create attempt per invocation**

---

## Firestore create contract

- Create-only `user/{uid}` (Admin `create()` / pre-exists check)
- Merge / update / overwrite **forbidden**
- Typed allowlist doc from Phase 5I schema
- `FIXTURE_ALREADY_EXISTS` stops
- Geography **verify-only** before create: `countries/saudi_arabia` + `villages/city_sa_riyadh` (no geo create)
- **One Firestore create attempt per invocation**

---

## claim sync verification

- Bounded poll via `getUser` (`Phase5JClaimsVerification`)
- Expected: `{ country_id: "countries/saudi_arabia" }` only (`claimKeyCount=1`)
- Elevated / unexpected → `UNEXPECTED_FIXTURE_CLAIMS` → **not** `pilot_ready`
- Timeout → `CLAIM_SYNC_TIMEOUT` → **not** `pilot_ready`
- Claim **read** retries OK; Auth/Firestore writes not retried

---

## canonical fixture verification

Must prove:

| Check | Value |
|---|---|
| Role | driver |
| Operational | true |
| Synthetic | true (Firestore markers) |
| Registration | `pending_review` |
| accountEnabled | false (`actev_mndob=false`) |
| Active trip | false |
| Side effects | finance/trip/agent/customer/comms = 0 |

Failure → `failed_partial_canonical` / `CANONICAL_FIXTURE_VERIFICATION_FAILED`.

---

## idempotency

```text
logicalFixtureName = phase5i_driver_pilot_fixture_v1
idempotencyKey     = phase5i_provision_synthetic_driver_v1
```

Detects registry / Auth-partial / Firestore / `pilot_ready` — **never multi Auth** for same logical fixture.

---

## partial failure handling

State machine:

```text
planned → auth_created → firestore_created → claims_verified
  → fixture_verified → pilot_ready
                     ↘ failed_partial*
```

| Mode | Behavior |
|---|---|
| Auth-only orphan | `failed_partial_auth_only`; registry keeps UID; no second Auth; no auto-delete |
| Claims failure | `failed_partial_claims`; no second Auth |
| Canonical failure | `failed_partial_canonical` |
| Resume Firestore | `RESUME_FIRESTORE_ONLY` (no Auth re-create) |

---

## operator registry

Path: `.local/phase5j-fixture/` (**gitignored** via `.local/`)

Fields: logical name, uid, status, requestId, timestamps  
**Never stored:** password, token, email, phone, SA material

---

## audit

Intent + result via `Phase5JAuditPort` (memory in fakes; fail-closed if sink cannot record intent).  
Counts toward exact `auditWrites=2` on success.

---

## exact write counts

ONE successful provision (exact equality, not ≥):

| Surface | Count |
|---|---|
| authCreate | **1** |
| firestoreUserCreates | **1** |
| claimsSetCustomUserClaims | **1** |
| triggerInvocations | **1** |
| auditWrites | **2** |
| idempotencyWrites | **1** |
| finance / trip / agent / customer | **0** |

Observability: `Phase5JWriteObservability` per category.

This session (implementation / default tests): **all zeros**.

---

## IAM preflight

`runPhase5JIamPreflight()` — **check-only**:

- ADC only; refuses `GOOGLE_APPLICATION_CREDENTIALS` (SA keys)
- Documents required capabilities for createUser / Firestore create / getUser
- `mutationsPerformed=0`, `iamChanges=0`
- Does **not** call createUser or Firestore create
- No IAM binding changes

---

## fake tests

`src/test/unit/phase5j-auth-safe-synthetic-driver-provisioning.test.ts` — **18 tests**:

1. Happy path → `pilot_ready` + exact write counts  
2. Auth fail  
3. Firestore fail + no second Auth  
4. Claim timeout  
5. Elevated claims  
6. Canonical fail  
7. Idempotent rerun (`PILOT_READY_IDEMPOTENT`)  
8. Partial recovery detection (`RESUME_FIRESTORE_ONLY`)  
9. Gates / command / state machine / IAM / sanitization / ports unavailable  

---

## full test count

| Check | Result |
|---|---|
| `npm test` | **PASS** — **947 passed \| 2 skipped (949)** |
| Phase 5J unit | **18 passed** |
| Phase 5J live harness | **3 passed** (SKIP default) |
| Phase 5I dry-run | **untouched / still PASS** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

---

## typecheck

**PASS** (`tsc --noEmit`)

---

## build

**PASS** (`next build`)

---

## Production calls = 0

```text
Production calls = 0
```

No Firebase Admin Auth/Firestore adapters constructed during default test/typecheck/build.

---

## Production writes = 0

```text
Production writes = 0
Auth writes = 0
Finance writes = 0
Trip writes = 0
```

---

## Provisioning implementation score /100

**92 / 100**

Real gated path, typed command, fake coverage, exact write counts, registry, IAM check-only, and Firebase adapters exist behind gates. Deduction: live operator provision not executed this session (by STOP); resume-Firestore path is detected but not auto-applied without separate approval.

---

## GO | CONDITIONAL GO | NO-GO

### for ONE operator-controlled real synthetic fixture provisioning attempt

**CONDITIONAL GO**

Conditions:

1. Operator explicitly sets **all** required gates inline (prefer no ambient export of write flags)
2. `PHASE5J_PROVISION_SYNTHETIC_DRIVER=1` + ports via `createFirebasePhase5JProvisioningPorts()` after gates OK
3. ADC only — no SA JSON keys
4. IAM preflight check-only first (`mutations=0`)
5. Expect exact write counts on success; refuse multi Auth / overwrite
6. **Do not** start Pilot or Finance in the same session
7. Registry lands under `.local/phase5j-fixture/` with no secrets

### this implementation session

**NO-GO for execution** — path implemented; live Auth/Firestore provision **not** authorized / **not** run.

---

## Artifacts

| File | Role |
|---|---|
| `isPhase5JSyntheticDriverProvisionEnabled.ts` | Harness + write-flag parsers |
| `Phase5JOperatorGates.ts` | Gate evaluation |
| `Phase5JFixtureStateMachine.ts` | Status machine |
| `ProvisionSyntheticDriverFixtureCommand.ts` | Typed allowlist command |
| `Phase5JExpectedWriteCounts.ts` | Exact counts |
| `Phase5JOperatorRegistry.ts` | Local registry + idempotency |
| `Phase5JProvisioningPorts.ts` | Ports + audit |
| `Phase5JClaimsVerification.ts` | Bounded claim poll |
| `Phase5JCanonicalFixtureVerification.ts` | Canonical + side effects |
| `Phase5JIamPreflight.ts` | IAM check-only |
| `Phase5JWriteObservability.ts` | Per-category observability |
| `Phase5JFakePorts.ts` | Fake Auth/Firestore |
| `Phase5JFirebaseAdapters.ts` | Real Admin adapters (gated) |
| `SyntheticDriverProvisioningService.ts` | dryRun + provision + verify |
| `src/test/unit/phase5j-….test.ts` | Fake scenarios |
| `src/test/live/phase5j-provision-synthetic-driver.test.ts` | SKIP-default harness |

---

## STOP

No Auth create. No Firestore create. No Pilot. No Finance.  
Session Production/Auth/Finance/Trip writes = **0**.

# TOURI TAXI ADMIN NEXT — PHASE 5E SYNTHETIC PRODUCTION PILOT PREPARATION REPORT

**Date:** 2026-09-12  
**Phase:** 5E Synthetic Production Pilot Preparation  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** PREPARATION ONLY — no Production write execution  
**Production calls this session:** **0** (offline contracts only)  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Synthetic Driver created:** **NO**  
**Pilot executed:** **NO**  
**Finance started:** **NO**  
**Write flags enabled:** **NO** (all remain false)

---

## recommended Pilot

**Driver `needs_changes`** on a dedicated synthetic Production Driver  
(`pending_review` → `needs_changes`).

Source: Phase 5D `assessSafestFuturePilot()` + Phase 5E `WHY_DRIVER_NEEDS_CHANGES_IS_SAFEST`.

---

## why it is safest

| Candidate | Blast | Why not first Pilot |
|---|---|---|
| **driver.needs_changes** | **low** | Review signal only; account stays inactive; no Auth; reversible; no trip/finance |
| driver.approve | medium | Enables operational path |
| driver.suspend | medium | Disables approved account; trip-guard complexity |
| agent.activate | high | One-country-one-active invariant |
| customer.block / disable | medium | User-facing; shared-user / Auth-sync surface |

**Verdict:** Lowest blast-radius allowlisted mutation among Driver/Agent/Customer Controlled Writes.

---

## synthetic Driver schema requirements

**NOT created in Phase 5E.** Operator creates manually later if approving a future Pilot.

| Requirement | Value |
|---|---|
| Collection | `user` (proven Legacy/4A-5) |
| Document id strategy | `test_phase5e_driver_needs_changes_pilot_001` |
| Discriminator | `ismndob: true` |
| Registration | `registration_status: pending_review` |
| Account | `actev_mndob: false` |
| Markers | `is_test: true`, `functional_test: true` |
| Geography | mapped `Rev_dolh` + `mndob_vill` |
| Forbidden | phone/email/national ID/IBAN, agent/admin flags, finance aggregates, busy trip flags |
| Membership | must classify as operational Driver (`ismndob` + proven registration evidence, not admin) |

Code: `Phase5ESyntheticDriverRequirements.ts`

---

## Auth dependency

```text
AUTH_REQUIRED_FOR_PILOT_TARGET = false
```

- Controlled Write pipeline never calls Auth.
- Synthetic ids use `test_` / `qa_` prefixes (not Firebase Auth UIDs).
- **No fake Auth user creation.**
- If `uid` field is present on the Firestore doc, it SHOULD equal `documentId` to avoid `authUidKnowledge=mismatch` in read metrics — but Auth user existence is **not** required for the Pilot mutation.

---

## test marker strategy

Reuse existing `isTestOrNoncanonicalDriver` conventions:

- Document id prefixes: `cp5_` | `test_` | `demo_` | `golden_` | `qa_`
- Boolean markers: `is_test`, `functional_test`, `demo`, `qa_fixture`
- Gate: non-synthetic → **`PILOT_TARGET_NOT_SYNTHETIC`**

---

## exact before state

| Field | Value |
|---|---|
| `registrationStatus` | `pending_review` |
| `accountEnabled` | `disabled` |
| `tripState` | `idle` |
| `isOperationalDriver` | `true` |
| `preconditionToken` | captured at precondition read |
| action | `needs_changes` |

---

## exact after state

| Field | Value |
|---|---|
| `registrationStatus` | `needs_changes` |
| `accountEnabled` | `disabled` (unchanged) |
| `tripState` | `idle` (unchanged) |
| `isOperationalDriver` | `true` (unchanged) |
| `preconditionToken` | rotated after apply |

---

## allowed diff

**Domain allowlist:** `registrationStatus`, `preconditionToken` only.

**Firestore allowlist (needs_changes Pilot):** `registration_status` only  
(narrower than full Legacy Admin `requestChangesPatch` — intentional blast-radius reduction; matches Phase 5A Fake contract).

Any other field change → **`PILOT_UNEXPECTED_FIELD_MUTATION`**.

---

## rollback plan

| Item | Status |
|---|---|
| Admin command `needs_changes→pending_review` | **NOT supported** (5A) |
| Proven transition | `resubmit_to_review` exists in state machine |
| Strategy | Controlled recovery: restore **only** `registration_status=pending_review` under separate approval **OR** Legacy driver-app resubmit if Auth/app path exists |
| Execute in Phase 5E | **NO** |
| Invent new admin command | **NO** |

---

## Production repository review

`ProductionDriverWriteRepository`:

- Kind: `production_driver_write_unreachable`
- `planAllowlistedTransaction()` — typed allowlisted patch + transaction precondition plan
- `apply()` — hard-locked unreachable (`PRODUCTION_WRITE_DISABLED`)
- **No** `Record<string, unknown>` arbitrary payload
- `arbitraryPayloadAllowed: false`
- Unexpected field → `PILOT_UNEXPECTED_FIELD_MUTATION`
- Runtime factory still returns `DisabledDriverWriteRepository`
- **Do not activate**

---

## dry-run harness

`src/test/live/phase5e-driver-production-pilot.test.ts`  
+ `runPhase5EDriverPilotDryRun()`

```text
PHASE5E_DRIVER_PILOT_DRY_RUN=1  → read/validate/plan
wouldWrite=true (when plan valid)
actualWrite=false
write flags remain false
writes = 0
```

---

## Pilot harness

Same live file. Default:

```text
PHASE5E_DRIVER_PILOT unset/≠1 → SKIP (PHASE5E_DRIVER_PILOT_SKIP)
```

Requires when `=1`: project ID, `PILOT_DRIVER_ID`, before state, precondition token, operator identity, `super_admin`.  
Non-synthetic → `PILOT_TARGET_NOT_SYNTHETIC`.  
Phase 5E still does **not** execute Production mutation even if gate requirements are present.

---

## expected write counts

| Surface | Preparation / dry-run | Future real Pilot |
|---|---|---|
| Driver domain | 0 | 1 |
| Audit INTENT | 0 | 1 |
| Audit RESULT | 0 | 1 |
| Idempotency | 0 | 1 |
| Auth | 0 | 0 |
| Finance | 0 | 0 |
| Trip | 0 | 0 |
| Agent / Customer | 0 | 0 |

---

## flag activation/deactivation plan

**Now (Phase 5E):** all false.

Future temporary window (operator-controlled, max 1 attempt, fail-closed):

1. Enable only `GLOBAL_PRODUCTION_WRITE_ENABLED` ∧ `PRODUCTION_WRITE_ENABLED` ∧ `DRIVER_WRITE_ENABLED`
2. Never enable Agent/Customer/Finance/Auth write flags
3. One Pilot attempt
4. Immediately disable all flags
5. Verify after-state + audit + isolation

**No auto progression.**

---

## audit expectations

| Mode | `productionWriteExecuted` |
|---|---|
| Preparation / dry-run | `false` |
| Future real Pilot | `true` (INTENT + RESULT, no PII) |

---

## observability expectations

`Phase5EPilotObservabilitySummary` — no phone/email/displayName/nationalId/IBAN/raw tokens.  
Includes: project fingerprint, action, before/after expected, wouldWrite/actualWrite, write flags, write counts, synthetic flag, Auth dependency flag.

---

## isolation

Finance / Auth / Trip / Agent / Customer writes = **0**.  
Only Driver domain + audit + idempotency may change in a future Pilot.

Actor: **`super_admin` only** for first Pilot. No new SA keys / IAM broaden. No secrets in repo.

---

## future execution sequence (documented only)

1. Dry-run (`PHASE5E_DRIVER_PILOT_DRY_RUN=1`)  
2. Operator review  
3. Narrow enable (temporary)  
4. One Pilot  
5. Disable flags  
6. Verify  

**No auto progression. Not executed in Phase 5E.**

---

## tests

| Suite | Result |
|---|---|
| `src/test/unit/phase5e-synthetic-production-pilot-preparation.test.ts` | dry-run / gates / allowlist / diff / repo review |
| `src/test/live/phase5e-driver-production-pilot.test.ts` | SKIP default + dry-run path |

Offline: `npm test` && `npm run typecheck` && `npm run build`

| Check | Result |
|---|---|
| `npm test` | **PASS** — **790 passed \| 2 skipped (792)** |
| Phase 5E unit suite | **26 passed** |
| Phase 5E live harness | **1 passed** (SKIP path) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

---

## Production calls = 0

Offline contracts only; no Production Firebase clients invoked.

## Production writes = 0

## Auth writes = 0

## Finance writes = 0

## Trip writes = 0

---

## Pilot Preparation score /100

**96 / 100**

Deductions: synthetic Production Driver record not yet present (−2); real Pilot not runnable until operator creates synthetic target + separate activation (−2). Preparation contracts, gates, dry-run, and unreachable Production allowlist review are complete.

---

## GO | CONDITIONAL GO | NO-GO for ONE operator-controlled DRY-RUN only

**GO** for **ONE operator-controlled DRY-RUN only** (`PHASE5E_DRIVER_PILOT_DRY_RUN=1`) — read/validate/plan; writes=0; flags false.

**NO-GO** for real Pilot execution, write-flag enablement, synthetic Driver auto-creation, or Finance.

**STOP.** No real Pilot. No write flags. No auto create synthetic Driver. No Finance.

---

## Artifacts

| Path | Role |
|---|---|
| `src/application/controlled-writes/pilot/*` | Preparation contracts |
| `src/application/controlled-writes/drivers/DriverWriteRepository.ts` | Structural Production plan (unreachable) |
| `src/test/unit/phase5e-synthetic-production-pilot-preparation.test.ts` | Offline unit contracts |
| `src/test/live/phase5e-driver-production-pilot.test.ts` | SKIP / dry-run harness |
| `docs/PHASE_5E_SYNTHETIC_PRODUCTION_PILOT_PREPARATION_REPORT.md` | This report |

---

## Closing posture

```text
controlledWritesImplemented = true
controlledWritesValidatedOffline = true
controlledWritesEnabled = false
productionWritesEnabled = false
```

**STOP.** No real Pilot. No write flags. No auto create synthetic Driver. No Finance.

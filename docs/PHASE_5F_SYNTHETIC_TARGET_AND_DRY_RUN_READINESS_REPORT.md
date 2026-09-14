# TOURI TAXI ADMIN NEXT — PHASE 5F SYNTHETIC TARGET + DRY-RUN READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 5F Synthetic Target Discovery + Production Dry-Run Readiness  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** READ-ONLY readiness + offline tests  
**Live Production discovery this session:** **NOT RUN** (operator-controlled later)  
**Live dry-run this session:** **NOT RUN** (SKIP default)  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Synthetic Driver created:** **NO**  
**Write flags enabled:** **NO** (all remain false)  
**Finance started:** **NO**

---

## existing safe synthetic target availability

```text
availability = UNKNOWN / PENDING_OPERATOR
targetFound = (not evaluated live this session)
reason = live discovery not executed (PHASE5F_LIVE_DISCOVERY unset)
plannedId test_phase5e_driver_needs_changes_pilot_001 = INVALID unless exists+validates
autoCreate = forbidden
```

Offline discovery/selection contracts are implemented and unit-tested. Operator must run:

```bash
PHASE5F_DRIVER_PILOT_DRY_RUN=1 \
  PHASE5F_LIVE_DISCOVERY=1 \
  FIREBASE_ID_TOKEN='…' \
  PILOT_OPERATOR_IDENTITY='…' \
  PILOT_PRECONDITION_TOKEN='…' \
  npx vitest run src/test/live/phase5f-driver-pilot-dry-run.test.ts
```

If live discovery returns zero eligible candidates:

```text
targetFound = false
dryRunStatus = NO_GO
reason = NO_SAFE_SYNTHETIC_DRIVER_EXISTS
```

**STOP create.** Do not invent the planned Phase 5E id.

---

## target eligibility rules

ALL required (fail-closed):

| Rule | Evidence |
|---|---|
| operational Driver | `classifyDriverMembership` → `isOperationalDriver` |
| proven synthetic | strict markers only: id prefix `cp5_\|test_\|demo_\|golden_\|qa_` **or** `is_test` / `functional_test` / `demo` / `qa_fixture` — **no fuzzy display_name/email** |
| `registration_status` | `pending_review` |
| `actev_mndob` | `false` |
| country | mapped canonical `Rev_dolh` |
| city | `mndob_vill` represented |
| active trip | must be idle (`on_trip` / `mndon_newacc` not busy) |
| finance | no outstanding/bank operational fields → `financeImpact=none` |
| roles | no Agent / Admin; no Customer contamination |
| PII | never emitted in diagnostics |

**Selection:** deterministic ascending `documentId`. Zero → `NO_SAFE_SYNTHETIC_DRIVER_EXISTS`. Planned id never injected as fallback.

Code: `Phase5FProvenSyntheticClassification.ts`, `Phase5FSyntheticTargetEligibility.ts`, `Phase5FSyntheticTargetDiscovery.ts`, `Phase5FShadowDiscovery.ts`

---

## dry-run harness

| Item | Value |
|---|---|
| Live file | `src/test/live/phase5f-driver-pilot-dry-run.test.ts` |
| Default | **SKIP** unless `PHASE5F_DRIVER_PILOT_DRY_RUN=1` or `PHASE5E_DRIVER_PILOT_DRY_RUN=1` |
| Live discovery | `PHASE5F_LIVE_DISCOVERY=1` — bounded Drivers shadow query (`ismndob==true`, limit≤50) |
| Planner | `runPhase5FDriverPilotDryRun()` |
| `ProductionDriverWriteRepository.apply()` | **never invoked** (`productionApplyInvocationCount=0`) |
| Disabled write path | `createProductionRuntimeDriverWriteRepository()` remains `disabled_driver_write` |

Expected PASS shape (§6–17):

```text
pilotStatus = DRY_RUN_PASS
wouldWrite = true
actualWrite = false
action = needs_changes
before.registrationStatus = pending_review
plannedAfter.registrationStatus = needs_changes
domain/audit/idempotency/auth/finance/trip writes = 0
totalProductionWrites = 0
```

Fail-closed → `DRY_RUN_NO_GO`. Never falls back to a real Driver.

---

## write flags

All remain **false** (required for dry-run):

```text
GLOBAL_PRODUCTION_WRITE_ENABLED = false
PRODUCTION_WRITE_ENABLED = false
DRIVER_WRITE_ENABLED = false
AGENT_WRITE_ENABLED = false
CUSTOMER_WRITE_ENABLED = false
CUSTOMER_AUTH_WRITE_ENABLED = false
FINANCE_WRITE_ENABLED = false
controlledWritesEnabled = false
productionWritesEnabled = false
```

Any true flag → `WRITE_FLAGS_MUST_REMAIN_FALSE` / `DRY_RUN_NO_GO`.

---

## preconditions

- Capture live opaque precondition token (`PILOT_PRECONDITION_TOKEN` or live update-time capture by operator).
- Report only `preconditionCaptured = true|false` — **raw token not echoed** in observability.
- Missing token with target present → `PRECONDITION_TOKEN_REQUIRED` → `DRY_RUN_NO_GO`.
- Do not hardcode Production tokens in fixtures used as live substitutes.

---

## active-trip safety

- Eligibility + dry-run require `activeTrip = false` (trip axis idle).
- Busy → `DRIVER_HAS_ACTIVE_TRIP` → `DRY_RUN_NO_GO`.

---

## finance isolation

- Target eligibility: `financeImpact = none` (no outstanding/bank operational fields).
- Dry-run: `financeWrites = 0`.
- Finance implementation **not started**.

---

## Auth isolation

```text
authRequiredForTarget = false   (AUTH_REQUIRED_FOR_PILOT_TARGET)
authWrites = 0
```

If Auth became required → `AUTH_DEPENDENCY_CHANGED` → `DRY_RUN_NO_GO`.  
No Auth user create. No Auth mutation.

---

## allowed diff

Firestore allowlist (Pilot):

```text
registration_status: pending_review → needs_changes
```

Domain allowlist: `registrationStatus`, `preconditionToken` (technical rotation only).  
Any other field → `PILOT_UNEXPECTED_FIELD_MUTATION` → `NO_GO`.  
No arbitrary `Record<string, unknown>` payload.

---

## audit plan

```text
auditIntentPlanned = true
auditResultPlanned = true
auditWrites = 0
productionWriteExecuted = false
```

Planned metadata only (resource/action/targetId/actorRole). No PII. No Production audit write.

---

## idempotency plan

```text
idempotencyPlanned = true
idempotencyWrites = 0
key pattern = phase5f_drv_nc_{pilotDriverId}_{operatorUid}_{utcDate}_{nonce}
```

Structure validated offline. No Production idempotency marker created.

---

## observability (§16)

`Phase5FDryRunObservabilitySummary` includes:

`overallStatus`, `projectFingerprint`, `targetFound`, `targetSynthetic`, `targetId`, `actorRole`, `action`, `currentState`, `plannedState`, `operationalDriver`, `activeTrip`, `financeImpact`, `authDependency`, `scopePass`, `rbacPass`, `preconditionCaptured`, `plannedDiffValid`, `wouldWrite`, `actualWrite`, write counts, `allWriteFlagsFalseAfterRun`, `productionApplyInvocationCount`.

No phone/email/displayName/nationalId/IBAN/raw tokens.

---

## tests

| Suite | Result |
|---|---|
| `src/test/unit/phase5f-synthetic-target-and-dry-run-readiness.test.ts` | **20 passed** |
| `src/test/live/phase5f-driver-pilot-dry-run.test.ts` | **1 passed** (SKIP path) |

Coverage: eligibility, selection, strict synthetic (no fuzzy names), shadow filter, allowed diff, write-flag guards, dry-run `wouldWrite`/`actualWrite`, apply count=0, audit/idempotency plan, no planned-id fallback.

---

## full test count

| Check | Result |
|---|---|
| `npm test` | **PASS** — **811 passed \| 2 skipped (813)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

---

## typecheck

**PASS** (`tsc --noEmit`)

---

## build

**PASS** (`next build`)

---

## Production writes = 0

Confirmed for this session: offline contracts + SKIP harness only. No Production write. No synthetic create. No write-flag enablement. No Finance.

---

## GO | CONDITIONAL GO | NO-GO for ONE operator-controlled Production dry-run

**GO** for **ONE operator-controlled Production dry-run** (`PHASE5F_DRIVER_PILOT_DRY_RUN=1` or `PHASE5E_DRIVER_PILOT_DRY_RUN=1`, optionally `PHASE5F_LIVE_DISCOVERY=1`).

Conditions the operator must satisfy at run time:

1. Live discovery finds ≥1 eligible proven synthetic Driver **or** dry-run refuses with `NO_SAFE_SYNTHETIC_DRIVER_EXISTS` (no invent).
2. All write flags remain false.
3. Precondition token captured without PII leak.
4. `actualWrite=false`, `productionApplyInvocationCount=0`.

**NO-GO** for real Pilot write execution, write-flag enablement, synthetic Driver auto-creation, or Finance.

---

## Artifacts

| Path | Role |
|---|---|
| `src/application/controlled-writes/pilot/Phase5F*.ts` | Discovery / eligibility / dry-run / shadow filter |
| `src/application/controlled-writes/pilot/isPhase5FDriverPilotDryRunEnabled.ts` | Env gates |
| `src/test/unit/phase5f-synthetic-target-and-dry-run-readiness.test.ts` | Offline unit contracts |
| `src/test/live/phase5f-driver-pilot-dry-run.test.ts` | SKIP / optional live discovery harness |
| `docs/PHASE_5F_SYNTHETIC_TARGET_AND_DRY_RUN_READINESS_REPORT.md` | This report |

---

## Closing posture

```text
controlledWritesImplemented = true
controlledWritesValidatedOffline = true
controlledWritesEnabled = false
productionWritesEnabled = false
syntheticTargetAvailability = UNKNOWN/PENDING_OPERATOR
dryRunHarnessReady = true
productionWritesThisSession = 0
```

**STOP.** No real write. No auto create. No write flags. No Finance.

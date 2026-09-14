# TOURI TAXI ADMIN NEXT — PHASE 5I DRY-RUN HARNESS FIX REPORT

**Date:** 2026-09-13  
**Phase:** 5I dry-run harness concrete fix  
**Project path:** `/Users/ventura/touri-admin-next`  
**Operator offline dry-run this session:** **NOT RUN** (explicit STOP)  
**Auth provision this session:** **NO**  
**Firestore fixture create this session:** **NO**  
**Write flags enabled:** **NO**  
**Production calls / writes:** **0**  
**Auth / Finance / Trip writes:** **0**

---

## confirmed root cause

`src/test/live/phase5i-synthetic-driver-provisioning.test.ts` evaluated
`PROVISION` / `DRY_RUN` / `AUTH_WRITE` at **module scope**. Vitest global setup
sanitization can clear or race operator intent before those constants are
trusted as execution decisions, so a shell

```text
PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1
```

could still take the default **SKIP** branch.

The harness also had **no writer** for:

```text
.local/phase5i-provision-dry-run/dry-run-safe-summary.json
.local/phase5i-provision-dry-run/observability.ndjson
```

---

## environment preservation fix

Same mechanism as Phase 5G operator-harness preservation:

| Piece | Role |
|-------|------|
| `src/test/helpers/operatorHarnessEnvPreservation.ts` | Capture / clear never-preserve / restore |
| `src/test/setup.ts` | Capture at setup **module load**; restore after each `beforeEach` wipe |

**Preserved (only):**

- `PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY` (existing 5G live-read arm)
- `PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN` (this fix)

**Never preserved / cleared on sanitization:**

- `PHASE5I_PROVISION_SYNTHETIC_DRIVER`
- `SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED`
- `GLOBAL_PRODUCTION_WRITE_ENABLED`
- `PRODUCTION_WRITE_ENABLED`
- `DRIVER_WRITE_ENABLED`

Write flags continue to be forced `false` in `beforeEach`. Sanitization was
**not** broadly disabled.

---

## runtime gate fix

- Removed authoritative module-scope `PROVISION` / `DRY_RUN` / `AUTH_WRITE`.
- Resolve gates **inside each `it()`** via `resolveGatesAfterSetup()` after
  setup restoration (Phase 5G contract pattern).
- Split tests:
  1. `default/no flag → safely skips provisioning`
  2. `dry-run flag → executes Phase 5I plan-only dry-run`
  3. `provision flag → remains hard-denied in design session`
  4. `operator dry-run flag survives global setup sanitization`

**Hard lock retained:** even with `provisionEnv: "1"` + `authFixtureWriteEnv: "1"`,
service returns `DESIGN_SESSION_NO_LIVE_WRITES`, `actualWrite=false`, writes=0.

**Dry-run semantics (design-session lock documented):**

```text
dryRunExecuted = true
wouldWrite = false   ← intentional while gates stay locked
actualWrite = false
productionWrites = 0
authWrites = 0
```

`wouldWrite=false` is **not** flipped merely to match earlier examples.

**Offline plan-only:** no `FIREBASE_ID_TOKEN`, ADC, Production read/Auth/Firestore.

---

## summary writer

`Phase5IProvisionDryRunObservability.ts` → safe summary + NDJSON event.

Artifacts (when dry-run executes / report dir present):

```text
.local/phase5i-provision-dry-run/dry-run-safe-summary.json
.local/phase5i-provision-dry-run/observability.ndjson
```

Safe fields only (§5): `overallStatus`, `dryRunExecuted`, planning validity
booleans, write counters = 0, `allWriteFlagsFalseAfterRun`.  
No token / email / phone / password / generated UID.

`overallStatus = DRY_RUN_PASS` when planning checks succeed.

---

## regression tests

| Suite | Coverage |
|-------|----------|
| `phase5i-dry-run-harness-fix.test.ts` | absent/0 → SKIP; `1` → dry-run; preserve allowlist; summary+obs no PII |
| `phase5i-synthetic-driver-provisioning.test.ts` | skip / dry-run / hard-deny / sanitization survival |
| existing `phase5i-auth-safe-…test.ts` | §32 offline contracts unchanged |

---

## full test count / typecheck / build

| Check | Result |
|-------|--------|
| `npm test` | **PASS** — **926 passed \| 2 skipped (928)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Production / Auth / Finance / Trip calls & writes | **0** |

---

## GO / NO-GO for one operator Phase 5I offline dry-run

**GO** for **one operator-controlled offline plan-only dry-run**:

```bash
PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1 \
  npx vitest run src/test/live/phase5i-synthetic-driver-provisioning.test.ts
```

Expect: `dryRunExecuted=true`, `overallStatus=DRY_RUN_PASS`, `wouldWrite=false`
(design-session lock), `actualWrite=false`, writes=0, summary under
`.local/phase5i-provision-dry-run/`.

**NO-GO** for live Auth create / Firestore fixture / write-flag enablement /
Pilot / Finance.

**STOP:** This session did **not** execute the operator dry-run.

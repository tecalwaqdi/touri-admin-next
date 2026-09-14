# TOURI TAXI ADMIN NEXT — PHASE 5J REAL OPERATOR HARNESS ENABLEMENT REPORT

**Date:** 2026-09-13  
**Phase:** 5J Real Operator Provision Harness Enablement  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENT ONLY — **NOT EXECUTED**  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**IAM changes this session:** **0**  
**Live flags enabled:** **NO**  
**Pilot executed:** **NO**  
**Finance started:** **NO**

---

## hard-deny root cause

`src/test/live/phase5j-provision-synthetic-driver.test.ts` still contained design-session hard-denial:

```ts
expect(gates.ok).toBe(false);
```

plus commentary that write-enabling flags must not be set. That made the harness **non-executable** even after IAM create permissions become available.

Separately, Vitest global setup clears write-arming flags and only preserves `PHASE5J_PROVISION_SYNTHETIC_DRIVER`, so operator-supplied inline write gates were silently wiped before the test body — there was no Phase-5G-style live env re-apply for write gates.

---

## exact harness change

| Before | After |
|---|---|
| Hard `expect(gates.ok).toBe(false)` | Decision tree via `runPhase5JProvisionHarnessFlow` |
| Armed → always GATED_REFUSED | not armed → **SKIPPED**; armed+invalid gates → **GATED_REFUSED**; armed+valid → IAM then ≤1 provision |
| Summary: SKIPPED \| GATED_REFUSED \| WOULD_REQUIRE_OPERATOR | **SKIPPED \| GATED_REFUSED \| IAM_PREFLIGHT_FAILED \| PARTIAL_FAILURE \| PROVISIONED_NOT_VERIFIED \| PILOT_READY** |
| IAM = ADC + documented names | IAM = real `testIamPermissions` (injectable offline) |

Default without `PHASE5J_PROVISION_SYNTHETIC_DRIVER=1`: **SKIP**, all writes = 0 (unchanged).

Operator command (future — not run this session):

```text
PHASE5J_PROVISION_SYNTHETIC_DRIVER=1 \
PHASE5I_PROVISION_SYNTHETIC_DRIVER=1 \
SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=true \
GLOBAL_PRODUCTION_WRITE_ENABLED=true \
PRODUCTION_WRITE_ENABLED=true \
DRIVER_WRITE_ENABLED=true \
AGENT_WRITE_ENABLED=false \
CUSTOMER_WRITE_ENABLED=false \
CUSTOMER_AUTH_WRITE_ENABLED=false \
FINANCE_WRITE_ENABLED=false \
EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  npx vitest run src/test/live/phase5j-provision-synthetic-driver.test.ts
```

Pre-provision order (§6) enforced in `Phase5JProvisionHarnessFlow`: gates → IAM check-only → at most one `runProvision`. IAM fail ⇒ `provisionAttempted=false`, Auth/Firestore create = 0.

---

## actual IAM preflight implementation

`Phase5JIamPreflight.ts` upgraded:

1. Refuse `GOOGLE_APPLICATION_CREDENTIALS` (SA keys)
2. Resolve credential project fingerprint (`tutorial-multi-language-70gx4j`)
3. Call Google Cloud Resource Manager  
   `POST .../v1/projects/{projectId}:testIamPermissions` via ADC (`google-auth-library`)
4. Required permissions (ALL four for PASS):

```text
firebaseauth.users.create
firebaseauth.users.get
datastore.entities.create
datastore.entities.get
```

5. Results:
   - **IAM_PREFLIGHT_PASS** + `missingPermissions=[]` only if all four granted
   - **IAM_PREFLIGHT_FAILED** + `missingPermissions=[...]` otherwise
6. `mutationsPerformed=0`, `iamChanges=0`, `authCreateAttempted=false`, `firestoreCreateAttempted=false`

Injectable `permissionTester` / `credentialProvider` for offline unit tests — no Production calls in default CI.

Known current Production identity (prior check-only evidence, not re-run this session):

```text
PASS  firebaseauth.users.get
PASS  datastore.entities.get
MISSING firebaseauth.users.create
MISSING datastore.entities.create
```

---

## environment/sanitization strategy

**Global (unchanged safety):**

- Preserve only: `PHASE5G_LIVE_…`, `PHASE5I_…_DRY_RUN`, `PHASE5J_PROVISION_SYNTHETIC_DRIVER`
- Never preserve write-arming flags (`OPERATOR_HARNESS_NEVER_PRESERVE_KEYS`)
- Ordinary unit/integration continue to sanitize write flags every `beforeEach`

**Scoped Phase 5J live operator contract only:**

- `src/test/helpers/phase5jOperatorLiveEnv.ts`
- Live harness captures operator inline gates at **module load** (before wipe)
- When armed, re-applies them inside `it()` via `applyPhase5JOperatorLiveEnvironment`
- Same pattern as closed Phase 5G live-read env re-apply
- **No global weakening** — only `phase5j-provision-synthetic-driver.test.ts` uses this path

`GOOGLE_CLOUD_PROJECT` is now a required gate alongside `EXPECTED_PROJECT_ID`.

---

## fake provision tests

`phase5j-auth-safe-synthetic-driver-provisioning.test.ts` — **20 tests**, including:

- Gates (missing / unsafe / GOOGLE_CLOUD_PROJECT)
- Happy path → `pilot_ready` + exact write counts
- Auth fail → Firestore create = 0
- Firestore fail → partial; no second Auth
- Claim timeout / elevated claims / canonical fail → not Pilot
- Idempotent rerun / resume detection
- IAM missingPermissions + PASS path (fake tester)
- Harness flow: SKIP / GATED_REFUSED / IAM fail → zero writes / IAM pass → provision executes
- Sanitization: PHASE5J preserved; write flags cleared globally

Live harness — **3 tests** (SKIP default; offline IAM check-only stub; sanitization + live capture restore).

---

## full test count

| Check | Result |
|---|---|
| `npm test` | **PASS** — **949 passed \| 2 skipped (951)** |
| Phase 5J unit | **20 passed** |
| Phase 5J live harness | **3 passed** (SKIP default) |
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

```text
Production writes = 0
Auth writes = 0
IAM changes = 0
Finance writes = 0
Trip writes = 0
```

No live provision. No live flags set. No Pilot. No Finance.

---

## Future IAM (document only — NOT created)

Temporary least-privilege custom role should contain **only**:

```text
firebaseauth.users.create
datastore.entities.create
```

because get permissions already present. **Do not create role now. Do not grant now.**

---

## GO / NO-GO

### 1. temporary least-privilege IAM grant

**CONDITIONAL GO** — operator may grant a temporary custom role with only the two create permissions above to the existing ADC/shadow identity. Not performed this session.

### 2. permission re-check

**GO** — after grant, re-run check-only IAM preflight (`runPhase5JIamPreflight` / armed harness until IAM stage). Expect `IAM_PREFLIGHT_PASS` with `missing_count=0`. Mutations must remain 0.

### 3. ONE operator-controlled real provisioning attempt

**CONDITIONAL GO** — only after (1)+(2) pass, with all required inline gates + `PHASE5J_PROVISION_SYNTHETIC_DRIVER=1`, ADC only, harness armed path. Expect ≤1 Auth create and ≤1 Firestore create; `PILOT_READY` only if full verification. Do not start Pilot or Finance in the same session.

### this implementation session

**NO-GO for execution** — harness enabled; live IAM grant / provision / Pilot / Finance **not** authorized / **not** run.

---

## Artifacts

| File | Role |
|---|---|
| `Phase5JIamPreflight.ts` | Real check-only `testIamPermissions` |
| `Phase5JOperatorGates.ts` | Gates + `GOOGLE_CLOUD_PROJECT` |
| `Phase5JHarnessSafeSummary.ts` | §9/§10 summary + statuses |
| `Phase5JProvisionHarnessFlow.ts` | SKIP / gated / IAM / one provision |
| `phase5jOperatorLiveEnv.ts` | Scoped live operator env contract |
| `phase5j-provision-synthetic-driver.test.ts` | Executable SKIP-default harness |
| `phase5j-auth-safe-synthetic-driver-provisioning.test.ts` | Offline fake + harness flow tests |

---

## STOP

No IAM grant. No provision. No live flags. No Pilot. No Finance.  
Session Production/Auth/IAM writes/changes = **0**.

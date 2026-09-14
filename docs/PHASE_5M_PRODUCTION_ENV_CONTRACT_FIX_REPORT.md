# TOURI TAXI ADMIN NEXT — PHASE 5M PRODUCTION ENV CONTRACT FIX REPORT

**Date:** 2026-09-13  
**Phase:** 5M Production Environment Contract Fix  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENT + offline validation ONLY (no live Phase 5M operator apply this session)  
**Production writes this session:** **0**  
**IAM changes this session:** **0**  
**Pilot apply executed:** **NO**  
**Driver state changed:** **NO**  
**Finance started:** **NO**

---

## Root cause

Vitest global `beforeEach` (`src/test/setup.ts`) forces:

```text
APP_ENV=development
EXPECTED_ENVIRONMENT=development
write flags = false
```

Armed Phase 5M restored **write gates only** via `applyPhase5MOperatorLiveEnvironment(OPERATOR_LIVE_GATES)`, then called `loadEnv()` at `phase5m-driver-pilot-apply.test.ts` ~line 145.

`envSchema.superRefine` treats write flags as forbidden when:

```text
APP_ENV !== "production"  OR  NODE_ENV === "development"
```

Result:

```text
Environment validation failed:
PRODUCTION_WRITE_ENABLED=true forbidden in non-production / development startup
GLOBAL_PRODUCTION_WRITE_ENABLED=true forbidden in non-production / development startup
DRIVER_WRITE_ENABLED=true forbidden in non-production / development startup
```

IAM preflight and token validity were fine. Failure was **env contract only** — write path never reached.

---

## Affected function / line

| Location | Role |
|---|---|
| `src/test/setup.ts` `beforeEach` | Resets APP_ENV / EXPECTED_ENVIRONMENT → development |
| `applyPhase5MOperatorLiveEnvironment` (pre-fix) | Restored write flags **only** — missing production identity |
| `phase5m-driver-pilot-apply.test.ts` ~145 (pre-fix) | `loadEnv()` with write flags + development APP_ENV → throw |
| `src/config/env.ts` `envSchema.superRefine` | Correct fail-closed (unchanged) |

---

## Exact environment fix

New helper: `applyPhase5MLiveProductionWriteEnvironment` in `src/test/helpers/phase5mOperatorLiveEnv.ts`.

When `PHASE5M_DRIVER_PILOT_APPLY=1` (armed live harness only), **before** `loadEnv()`:

```text
NODE_ENV=production
APP_ENV=production
NEXT_PUBLIC_APP_ENV=production
EXPECTED_ENVIRONMENT=production
AUTH_MODE=verified_token

EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j
GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j

GLOBAL_PRODUCTION_WRITE_ENABLED=true
PRODUCTION_WRITE_ENABLED=true
DRIVER_WRITE_ENABLED=true
AGENT/CUSTOMER/CUSTOMER_AUTH/FINANCE/SYNTHETIC_AUTH_FIXTURE=false

LIVE_SHADOW_ALLOWED_RESOURCES=drivers   (Phase 5L minimum resource scope)
PRODUCTION_READ_ENABLED=false
PRODUCTION_READ_MODE=disabled

delete GOOGLE_APPLICATION_CREDENTIALS
preserve FIREBASE_ID_TOKEN (never log)
```

### Why not PRODUCTION_READ_ENABLED=true / shadow?

Global env safety (`env.ts` + `LiveShadowStartupGuard`) **forbids any write flag true** while `PRODUCTION_READ_MODE=shadow` or `PRODUCTION_READ_ENABLED=true`. Weakening that was explicitly out of scope.

Phase 5M write adapters use a **separate** ADC Firebase app (`phase5m-driver-pilot-apply`), not LiveShadow read repos. Resource scope is enforced by `assertPhase5MLiveShadowResources` → exact `drivers`.

### Actor resolution

`FirebaseAdminFactory.getAuthClient()` refuses write flags (`WRITE_FLAG_DENY`). Harness uses:

```text
loadPhase5MLiveProductionWriteEnv()           → write flags true (gates / apply)
envForPhase5MVerifiedActorResolution(env)    → write flags false (Auth verify only)
```

process.env write flags remain true for operator gates.

---

## Why first apply did not write

1. Operator armed Phase 5M + write flags + valid token + IAM_PREFLIGHT_PASS.  
2. Vitest wiped APP_ENV → development before the test body.  
3. Harness restored write flags but not production identity.  
4. `loadEnv()` fail-closed **before** `resolveProductionVerifiedActor` / `executeDriverControlledWrite`.  
5. **Production writes = 0** (correct safety behavior; env contract incomplete).

---

## Scoped sanitization strategy

| Layer | Behavior |
|---|---|
| Global `OPERATOR_HARNESS_PRESERVE_KEYS` | Keeps `PHASE5M_DRIVER_PILOT_APPLY` + `FIREBASE_ID_TOKEN` only |
| Global `OPERATOR_HARNESS_NEVER_PRESERVE_KEYS` | Clears all write-arming flags every `beforeEach` |
| Phase 5M live harness only | `applyPhase5MLiveProductionWriteEnvironment` when armed |
| Ordinary unit/integration tests | Never call the Production write helper; write flags stay false |

No changes to `src/config/env.ts` or `LiveShadowStartupGuard`.

---

## Regression tests

`src/test/unit/phase5m-production-env-contract.test.ts` (+ live/unit harness updates):

| Case | Result |
|---|---|
| no Phase5M flag → SKIP | PASS |
| armed + production + valid write gates → loadEnv PASS | PASS |
| armed + development → fail closed | PASS |
| wrong project → fail closed | PASS |
| unrelated write domain true → fail closed | PASS |
| LIVE_SHADOW_ALLOWED_RESOURCES != drivers → fail closed | PASS |
| token survives scoped sanitization | PASS |
| normal test env never retains write flags | PASS |

---

## Validation this session

```text
npm test       → 1028 passed | 2 skipped (79 files)
npm run typecheck → PASS (after build types present)
npm run build  → PASS
Production writes = 0
IAM changes = 0
Pilot apply = NOT RUN
```

---

## Artifacts

| File | Purpose |
|---|---|
| `Phase5MLiveWriteContract.ts` | drivers-only + project/identity asserts |
| `phase5mOperatorLiveEnv.ts` | `applyPhase5MLiveProductionWriteEnvironment` + actor env view |
| `phase5m-driver-pilot-apply.test.ts` | armed path uses full Production write env before loadEnv |
| `phase5m-production-env-contract.test.ts` | offline regressions |

---

## GO / NO-GO

| Step | Verdict | Notes |
|---|---|---|
| 1. temporary IAM re-grant | **GO** (operator) | Prior session already had IAM_PREFLIGHT_PASS for get/update/create + auth.get; re-grant only if binding expired |
| 2. IAM re-check | **GO** (operator) | check-only `testIamPermissions` before retry |
| 3. ONE Phase 5M operator apply retry | **GO** (operator) | Env contract fixed; still requires armed flags + token + IAM PASS; this session did **not** execute |

**This session:** STOP — no IAM grant, no Pilot, no Driver state change, no Finance.

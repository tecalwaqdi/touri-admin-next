# TOURI TAXI ADMIN NEXT — PHASE 5L MINIMAL READ CONTRACT FIX REPORT

**Date:** 2026-09-13  
**Phase:** 5L Minimal Production Read Contract Fix  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENT + offline validation ONLY (no live Phase 5L operator rerun this session)  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Auth writes:** **0**  
**Finance writes:** **0**  
**Trip writes:** **0**  
**RequestDriverChanges apply:** **NO**  
**DRIVER_WRITE_ENABLED:** **false**  
**Phase 5J create IAM restore:** **NO**  
**Re-provision:** **NO**  
**Finance started:** **NO**

---

## Root cause

Armed Phase 5L live harness called `loadEnv({ … PRODUCTION_READ_ENABLED: true … })` **without** `LIVE_SHADOW_ALLOWED_RESOURCES`.

`assertLiveShadowStartupOrThrow` (via `envSchema.superRefine`) requires when Production read is enabled:

- exactly **one** Phase 4A resource, **or**
- the **full** Phase 4B seven-resource set

Empty allowlist →:

```text
Environment validation failed:
PRODUCTION_READ_ENABLED:
LIVE_SHADOW_ALLOWED_RESOURCES must be exactly one Phase 4A resource
or the full Phase 4B set (got: <empty>)
```

Firebase actor token and ADC were valid; failure was **env contract only**. Production writes remained 0.

Secondary defect: `loadEnv` was invoked with a **disconnected partial object**, so even setting `process.env.LIVE_SHADOW_ALLOWED_RESOURCES` would not have been read unless included in that object. Fixed by `applyPhase5LLiveReadEnvironment` → `loadEnv()` (reads `process.env`).

---

## Exact Production resources required

Traced call chain (code, not filenames):

| Step | What it does | Canonical resource read? |
|---|---|---|
| `phase5l-driver-pilot-dry-run.test.ts` | Arms env + Auth + ADC ports | — |
| `createPhase5KReadOnlyFirebasePorts` | `auth.getUser(uid)` + `db.doc(\`user/${uid}\`).get()` | **drivers** (Phase 4A-5: `user` + operational driver) |
| `Phase5LDriverPilotDryRun` | Same two ports only; planner in-memory | **drivers** (re-read) |
| `verifyPhase5KFinanceAndTrip` | `on_trip` / wallet fields on **user doc** | **drivers** fields — **not** `trips`/`order` collection |
| `ProductionDriverWriteRepository` | `isReachable` only — **no** apply / **no** Firestore | none |
| Active-trip guard | `on_trip` → busy/idle via canonical mapper | **drivers** field |
| Scope / precondition | Snapshot + `PHASE_5I_FIXTURE_COUNTRY_ID` constant | **no** countries/cities collection read |

Explicit resource matrix:

| Resource | Read by Phase 5L? |
|---|---|
| **drivers** | **YES** (`user/{uid}` + Auth getUser) |
| trips | **NO** (active trip from `on_trip` on user doc) |
| countries | **NO** (country id constant for scope only) |
| cities | **NO** |
| agents | **NO** |
| customers | **NO** |
| landmarks | **NO** |

**Minimal allowlist:** `LIVE_SHADOW_ALLOWED_RESOURCES=drivers`  
**Did not** use Phase 4B all-seven merely to pass validation.

---

## Why the old env failed

1. Missing `LIVE_SHADOW_ALLOWED_RESOURCES` in the `loadEnv({…})` payload → zod default `""`.
2. Global startup gate correctly fail-closed on empty allowlist.
3. Observability sink also required for live read (`file_ndjson` / `structured_logger`); helper now sets `file_ndjson` under `.local/phase5l-driver-pilot/`.

---

## Exact read-contract implementation

| Artifact | Role |
|---|---|
| `Phase5LLiveReadContract.ts` | `PHASE_5L_LIVE_READ_RESOURCES = ["drivers"]`; `assertPhase5LLiveReadContract`; `assertPhase5LLiveProjectFingerprint` |
| `phase5lLiveReadEnvironment.ts` | `applyPhase5LLiveReadEnvironment(...)` |
| Live harness | apply helper → contract asserts → `loadEnv()` → `resolveProductionVerifiedActor` → dry-run |

`applyPhase5LLiveReadEnvironment` sets:

```text
APP_ENV=production
AUTH_MODE=verified_token
PRODUCTION_READ_ENABLED=true
PRODUCTION_READ_MODE=shadow
EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j
EXPECTED_ENVIRONMENT=production
GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j
LIVE_SHADOW_ALLOWED_RESOURCES=drivers
PRODUCTION_READ_OBSERVABILITY_SINK=file_ndjson
all write flags = false (incl. SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED)
delete GOOGLE_APPLICATION_CREDENTIALS
```

Global Phase 4A/4B `LiveShadowStartupGuard` **unchanged** (not weakened).

---

## Actor-token handling

- `FIREBASE_ID_TOKEN` added to `OPERATOR_HARNESS_PRESERVE_KEYS` (survives Vitest sanitization).
- Captured before live env mutation; never cleared by apply helper.
- Auth via `resolveProductionVerifiedActor` only (Admin `verifyIdToken` path — **no** JWT-as-auth decode).
- Safe summary refuses raw JWT / uid / preconditionToken leaks.

---

## Write-safety proof

| Flag / surface | Posture |
|---|---|
| `GLOBAL_PRODUCTION_WRITE_ENABLED` | false |
| `PRODUCTION_WRITE_ENABLED` | false |
| `DRIVER_WRITE_ENABLED` | false |
| `AGENT_WRITE_ENABLED` | false |
| `CUSTOMER_WRITE_ENABLED` | false |
| `CUSTOMER_AUTH_WRITE_ENABLED` | false |
| `FINANCE_WRITE_ENABLED` | false |
| `SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED` | false |
| `ProductionDriverWriteRepository.isReachable` | false |
| Dry-run `productionApplyInvoked` | always `false` |
| Session Production calls / writes | **0 / 0** |

Plan-only. No RequestDriverChanges apply.

When `PHASE5L_DRIVER_PILOT_DRY_RUN=1`, harness enters **live dry-run branch** (not default SKIP):

```text
flag → live read env valid → actor verified → fixture re-read → planner → zero writes
```

Safe summary path retained: `.local/phase5l-driver-pilot/dry-run-safe-summary.json`  
Successful live can return `PHASE5L_DRIVER_PILOT_DRY_RUN_PASS` with §8 fields.

---

## Tests / typecheck / build

| Check | Result |
|---|---|
| Phase 5L unit (planner) | **17 passed** |
| Phase 5L minimal read-contract unit | **9 passed** |
| Phase 5L live harness (default SKIP) | **2 passed** |
| `npm test` | **PASS** — **994 passed \| 2 skipped (996)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Live Phase 5L operator test this session | **NOT RUN** (per STOP) |

---

## GO / NO-GO for ONE operator-controlled Phase 5L live dry-run rerun

### **GO** for ONE operator-controlled Phase 5L live dry-run rerun

Preconditions (operator-local only):

```bash
PHASE5L_DRIVER_PILOT_DRY_RUN=1 \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/phase5l-driver-pilot-dry-run.test.ts
```

- Verified Production `super_admin` ID token  
- ADC (no SA JSON / unset `GOOGLE_APPLICATION_CREDENTIALS`)  
- Registry `.local/phase5j-fixture/registry.json` present (`pilot_ready`)  
- Expect read contract `drivers` only; plan-only; writes = 0  

### Still **NO-GO** for real RequestDriverChanges apply

Do not enable `DRIVER_WRITE_ENABLED`. Do not restore Phase 5J create IAM. Do not re-provision. Do not start Finance.

---

## STOP

No RequestDriverChanges apply. No DRIVER_WRITE_ENABLED. No Phase 5J create IAM restore. No re-provision. No Finance.

# TOURI TAXI ADMIN NEXT — PHASE 5G AUTH FALSE-NEGATIVE FIX REPORT

**Date:** 2026-09-13  
**Phase:** 5G Auth integration false-negative fix (Auth path only)  
**Project path:** `/Users/ventura/touri-admin-next`  
**Live Production inventory this session:** **NOT RUN** (explicit STOP)  
**Production calls this session:** **0**  
**Production writes this session:** **0**

---

## Root cause (proven)

Two coupled defects turned a **valid** `FIREBASE_ID_TOKEN` into `Auth failed: invalid_token`:

### 1. Phase 5G live Auth harness diverged from closed shadow Auth env

Closed Phase 4A-1 / 4A-2 path (proven PASS with same project / ADC):

- `applyLiveEnvironment()` sets `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `GOOGLE_CLOUD_PROJECT`, `EXPECTED_ENVIRONMENT`
- Deletes `GOOGLE_APPLICATION_CREDENTIALS` (ADC impersonation only)
- Then `loadEnv()` reads **from `process.env`**

Prior Phase 5G live path:

- Left `process.env.APP_ENV=development` (Vitest `src/test/setup.ts` `beforeEach`)
- Never set `GOOGLE_CLOUD_PROJECT`
- Never deleted `GOOGLE_APPLICATION_CREDENTIALS`
- Called `loadEnv({ …partial copy… })` instead of reading live `process.env` after apply

Artifact contrast: Phase 4A-1 auth diagnostic success recorded
`googleCloudProjectMatches=true` and `googleApplicationCredentialsSet=false`.
Phase 5G inventory recorded `blocker=Auth failed: invalid_token` with `productionCalls=1`.

### 2. Auth SDK / getUser failures collapsed to `invalid_token`

In `FirebaseAdminProductionIdentityVerifier.verify()`:

- `verifyIdToken(token, true)` **catch** → `invalid_token`
- `getUser(uid)` **catch** → `invalid_token`

Direct Firebase Admin `verifyIdToken` can PASS while the Admin Next path still fails on
revocation/network/credential/`getUser` — and Phase 5G reported that as a bad token.
That is an **Auth integration false negative**, not proof the JWT is invalid.

---

## Affected file / function

| Location | Role |
|----------|------|
| `src/test/live/phase5g-synthetic-driver-inventory.test.ts` → `applyPhase5GLiveAuthEnvironment` | Align live Auth env with closed Phase 4A-1/4A-2 |
| `src/infrastructure/auth/productionVerifiedAuth.ts` → `resolveProductionVerifiedActor` | Classify failures; optional `AUTH_TIMEOUT` |
| `src/infrastructure/auth/productionAuthFailureClassification.ts` | Operator codes: `TOKEN_*` / `ACTOR_RESOLUTION_FAILED` / `AUTH_TIMEOUT` |
| `src/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier.ts` → `verify` | Stop collapsing verify/getUser errors to `invalid_token` |

**Call chain (unchanged architecture):**  
`FIREBASE_ID_TOKEN` → `resolveProductionVerifiedActor` → `getProductionIdentityVerifier` → Firebase Admin `verifyIdToken(token, true)` → issuer/audience/exp → `getUser` → `resolveActorFromVerifiedToken` / RBAC.  
No second JWT decoder-as-auth.

---

## Why direct Firebase Admin verifyIdToken passed while Phase 5G failed

1. Direct Admin verify exercises signature/project checks only (operator script).
2. Phase 5G used a **non-closed** live env (missing `GOOGLE_CLOUD_PROJECT` / GAC delete / `APP_ENV` on `process.env`) plus a **disconnected** `loadEnv` copy.
3. Any subsequent SDK/`getUser` throw was reported as `invalid_token`, masking the real class of failure.

---

## Exact fix

1. **Reuse closed-phase Auth env** via `applyPhase5GLiveAuthEnvironment` (same fields as Phase 4A-1).
2. Capture `FIREBASE_ID_TOKEN` **before** env mutation; never clear it.
3. `loadEnv()` from `process.env` after apply (no disconnected copy).
4. Distinct denial codes: `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_PROJECT_MISMATCH`, `TOKEN_VERIFICATION_FAILED`, `ACTOR_RESOLUTION_FAILED`, `AUTH_TIMEOUT`.
5. Verifier: `token_verification_failed` vs `user_lookup_failed` (no collapse to `invalid_token`).
6. Optional 30s Auth timeout on Phase 5G resolve.
7. Write flags remain false; no live inventory auto-run.

---

## Auth regression tests

`src/test/unit/phase5g-auth-false-negative-fix.test.ts` (10):

- Valid verified-token `super_admin` → auth succeeds
- Missing / invalid / wrong audience / expired → distinct codes
- verifyIdToken throw vs getUser throw distinguished in `detail`
- `AUTH_TIMEOUT` when budget exceeded
- Denial payloads never embed raw token

Live harness offline contract:

- `applyPhase5GLiveAuthEnvironment` survives global setup wipe

---

## Offline validation (this session)

| Check | Result |
|-------|--------|
| `npm test` | **845 passed \| 2 skipped** (847) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Production calls | **0** |
| Production writes | **0** |

---

## GO / NO-GO for re-running ONE Phase 5G read-only live inventory

**GO** for **one operator-controlled** re-run:

```bash
PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY=1 \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/phase5g-synthetic-driver-inventory.test.ts
```

Expect Auth blocker (if any) to use distinct `TOKEN_*` / `AUTH_TIMEOUT` codes — not a collapsed `invalid_token` for a valid token under correct ADC.

**STOP:** This session did **not** execute that live inventory.

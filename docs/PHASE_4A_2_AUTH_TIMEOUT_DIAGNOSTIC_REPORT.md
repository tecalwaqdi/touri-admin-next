# PHASE 4A-2 AUTH TIMEOUT DIAGNOSTIC REPORT

Date: 2026-09-12  
Harness: `PHASE4A2_AUTH_DIAGNOSTIC=1` → `src/test/live/phase4a2-live-cities.shadow.test.ts`  
Constraint: Auth timeout diagnostic only — **no** `listCities()` / Firestore data queries.

## Problem

Live Cities timed out after ~30s **before** Firebase fingerprint and **before** any
Firestore query (`firestoreQueries=0`, `authResult` absent). The last blocking call
before `report.authResult` is `await resolveProductionVerifiedActor(...)`.

## Diagnostic design

Staged network-boundary timeouts (`withTimeout`, default **10_000ms**) around:

1. `factory.getAuthClient()` → `AUTH_CLIENT_INIT`
2. `authClient.verifyIdToken(token, true)` → `VERIFY_ID_TOKEN`
3. `authClient.getUser(uid)` → `GET_USER`
4. `resolveProductionVerifiedActor(...)` → `RESOLVE_PRODUCTION_ACTOR`

Between stages 3 and 4 the harness calls `resetProductionAuthSingletonsForTests()`
so the resolver does not reuse a stale / partially-initialized diagnostic factory.

Safe logs only: PASS/FAIL/TIMEOUT, `durationMs`, `uidPresent`, `disabled`,
`emailVerified`, Firebase `code` + redacted message. **Never** token, Authorization,
or full claims. Local JWT `exp` only for `tokenExpired` / `tokenSecondsRemaining`.

Stops **before** `geo.listCities`. Cities live path is **not** auto-run.

## How to run (operator)

```bash
export FIREBASE_ID_TOKEN='<Production Firebase ID token — never commit/log>'
PHASE4A2_AUTH_DIAGNOSTIC=1 npx vitest run src/test/live/phase4a2-live-cities.shadow.test.ts
```

Do **not** set `PHASE4A2_LIVE_CITIES=1` for this diagnostic.

Artifacts (gitignored):

- `.local/phase4a2-live/auth-timeout-diagnostic.json`
- `.local/phase4a2-live/live-safe-summary.json`

## Live run result (this session)

```text
PHASE 4A-2 AUTH TIMEOUT DIAGNOSTIC REPORT

authClientInit = MISSING_TOKEN (not executed)
verifyIdToken = MISSING_TOKEN (not executed)
getUser = MISSING_TOKEN (not executed)
resolveProductionVerifiedActor = MISSING_TOKEN (not executed)
tokenExpired = null
tokenSecondsRemaining = null
firestoreQueries = 0
writes = 0
final Read = disabled
final Write = disabled
files changed =
  - src/test/live/phase4a2-live-cities.shadow.test.ts
  - docs/PHASE_4A_2_AUTH_TIMEOUT_DIAGNOSTIC_REPORT.md
critical finding = MISSING_TOKEN — FIREBASE_ID_TOKEN absent in shell; staged Auth hang/fail not yet classified
```

Offline validation: unit tests PASS (243), typecheck PASS, Auth-diagnostic MISSING_TOKEN
path exercised (`firestoreQueries=0`, writes=0, Read/Write restored disabled). Cities
**not** run. Re-run with `FIREBASE_ID_TOKEN` in the shell to classify which stage hangs.

## Classifications

| Code | Meaning |
|------|---------|
| `AUTH_CLIENT_INIT_TIMEOUT` | `getAuthClient` exceeded 10s |
| `VERIFY_ID_TOKEN_TIMEOUT` | `verifyIdToken` exceeded 10s |
| `GET_USER_TIMEOUT` | `getUser` exceeded 10s |
| `RESOLVE_PRODUCTION_ACTOR_TIMEOUT` | full resolver exceeded 10s |
| `FIREBASE_AUTH_ERROR` | Firebase/Admin error (code + safe message) |
| `ACTOR_MAPPING_ERROR` | resolver returned `ok:false` or threw in mapping |
| `MISSING_TOKEN` | `FIREBASE_ID_TOKEN` unset |

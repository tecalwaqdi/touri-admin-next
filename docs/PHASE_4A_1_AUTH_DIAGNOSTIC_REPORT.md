# PHASE 4A-1 AUTH DIAGNOSTIC REPORT

Date: 2026-09-11  
Harness: `PHASE4A1_AUTH_DIAGNOSTIC=1` → `src/test/live/phase4a1-live-countries.shadow.test.ts`  
Constraint: Auth diagnostic only — **no** `listCountries()` / Firestore data queries.

## Confirmed root cause (runtime)

Live Auth with ADC failed under Vitest’s **default jsdom** environment with
`app/invalid-credential`. The same token + ADC path fully PASSed when run as:

```bash
npx vitest run --environment node --testTimeout 30000 \
  src/test/live/phase4a1-live-countries.shadow.test.ts
```

(`verifyIdToken`, `getUser`, `resolveProductionVerifiedActor`).

**Permanent fix:** file-level `// @vitest-environment node` plus an explicit
~30s timeout on the live Auth/Countries `it` only (not a global Vitest timeout).
A regression in the same file asserts Node runtime (no `window`/`document`).

Temporary stale named-app inspection / Outcome A|B|C preflight scaffolding was
removed after this root cause was confirmed. Normal Phase 4A-1 live path is
`resolveProductionVerifiedActor` → (optional Auth-only stop) → fingerprint →
countries → write trap → kill switch.

## How to re-run Auth-only (operator)

```bash
export FIREBASE_ID_TOKEN='<Production Firebase ID token — never commit/log>'
PHASE4A1_AUTH_DIAGNOSTIC=1 npx vitest run src/test/live/phase4a1-live-countries.shadow.test.ts
```

Must use the file’s Node environment directive (already in the test file).
Still **no Countries** / Firestore when `PHASE4A1_AUTH_DIAGNOSTIC=1`.

Do **not** set `PHASE4A1_LIVE_COUNTRIES=1` unless intentionally running the
full countries live window.

Artifacts (gitignored): `.local/phase4a1-live/live-safe-summary.json`.

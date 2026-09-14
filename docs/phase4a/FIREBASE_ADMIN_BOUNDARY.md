# FIREBASE_ADMIN_BOUNDARY

## Rules

1. **UI MUST NOT** import `@/infrastructure/production/**` or `firebase-admin`.
2. **Application MUST NOT** depend on `firebase-admin`.
3. **Domain MUST NOT** depend on `firebase-admin` or production firebase modules.
4. Only `src/infrastructure/production/firebase/**` may dynamically import `firebase-admin`.
5. Initialization is **lazy** and **gated** via `FirebaseAdminFactory.getApp()`.

## Layers

```
UI / features / components
  → application services
    → domain contracts
      → infrastructure/production (repos via DI)
        → firebase/ (Admin factory — gated)
        → firestore/ (READ-ONLY client)
```

## Identity

- `FirebaseAdminProductionIdentityVerifier` uses injectable `FirebaseAuthAdminClient`.
- Tests use `FakeFirebaseAuthAdminClient` — no network.
- Output is domain `VerifiedIdentity` only — **no Firebase Admin types leak**.
- Staging/production reject trust of `x-user-id` / `x-role` / `x-country` / `x-agent`.

## Architecture tests

- `isForbiddenUiImport` / `isForbiddenApplicationImport` / `isForbiddenDomainImport`
- Filesystem scan of `src/components`, `src/features`, `src/app` (non-api UI) for forbidden imports

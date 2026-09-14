# WRITE_ISOLATION_VERIFICATION

## Proofs

1. Shadow container registers **only** `DisabledWriteRepository` (+ disabled command ports).
2. `assertNoProductionWriteContainerFactory` — no `createProductionWriteContainer` export.
3. `assertShadowHasNoMutationServices` — `productionWriteRepos === null`.
4. Static scan `scripts/scan-production-write-surface.ts` — zero Firestore write API usage under `src/infrastructure/production` (except Disabled stubs).
5. Route traps:
   - POST/PUT/PATCH/DELETE → `PRODUCTION_WRITE_DISABLED`
   - Export → `SHADOW_EXPORT_DISABLED`
   - Settlement → `SHADOW_SETTLEMENT_DISABLED`

## Interface defense in depth

`FirestoreReadClient` exposes **only** `getDocument` + `query`.  
No `set` / `update` / `delete` / `create` / `writeBatch` / `runTransaction` on the Admin Next infrastructure interface.

## Credentials gitignore

```
serviceAccount*.json
firebase-adminsdk*.json
```

Static scan also flags credential JSON load paths in production infrastructure code.

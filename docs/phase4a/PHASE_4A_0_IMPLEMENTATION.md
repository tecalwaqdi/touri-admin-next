# PHASE_4A_0_IMPLEMENTATION

**Status:** COMPLETE — Production Read *implementation* against Fake/Emulator/Test doubles ONLY.  
**Production Read:** DISABLED (`PRODUCTION_READ_ENABLED=false`, `PRODUCTION_READ_MODE=disabled`)  
**Production Write:** DISABLED (all write flags false)  
**Real Production Firebase calls:** ZERO

## What landed

| Area | Location |
|---|---|
| Firebase Admin factory (lazy, gated) | `src/infrastructure/production/firebase/FirebaseAdminFactory.ts` |
| Identity verifier (Fake Auth Admin) | `src/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier.ts` |
| Firestore READ-ONLY client | `src/infrastructure/production/firestore/*` |
| Production read repositories | `src/infrastructure/production/repositories/*` |
| Legacy mappers | `src/infrastructure/production/mappers/LegacyProductionMappers.ts` |
| Shadow container | `src/infrastructure/production/container/createContainers.ts` |
| Credential providers | `src/infrastructure/production/credentials/*` |
| Shadow traps | `src/infrastructure/production/shadow/ShadowTraps.ts` |
| UI mode + ShadowBanner | `src/domain/ui/*`, `src/components/shadow/ShadowBanner.tsx` |
| Static write scan | `scripts/scan-production-write-surface.ts` |

## End-state flags (MUST remain)

```
PRODUCTION_READ_ENABLED=false
PRODUCTION_READ_MODE=disabled
PRODUCTION_WRITE_ENABLED=false
GLOBAL_PRODUCTION_WRITE_ENABLED=false
FINANCE_WRITE_ENABLED=false
DRIVER_WRITE_ENABLED=false
AGENT_WRITE_ENABLED=false
FULL_PII_SHADOW_ENABLED=false
```

## Fail-closed init

1. `PRODUCTION_READ_ENABLED=false` → `getApp()` throws `PRODUCTION_READ_DISABLED` **before** credentials or SDK.
2. Multi-gate: `APP_ENV=production`, `AUTH_MODE=verified_token`, read enabled, mode=`shadow`, project fingerprint match, **all write flags false**.
3. Read enabled + missing credentials → startup fail (`PRODUCTION_CREDENTIALS_MISSING`); **no Mock fallback**.

## Kill switch

**Dynamic (per request):** repository calls invoke `assertProductionReadEnabled` on every list/get. Flipping the flag denies the next request without redeploy of code (env reload / container rebuild required for process env).

## Explicit non-goals (4A-0)

- No Production credentials requested or stored
- No Production Firebase connection
- No Firebase/CF/Rules/Index deploy
- No Legacy modification
- No `createProductionWriteContainer`
- No Settlement / Ledger Production repositories

# PHASE_4A_ROLLOUT_PLAN

**Design only — no Production wire in Phase 4.**

## Steps (gated)

| Step | Scope | Gate |
|---|---|---|
| **4A-0** | Local fake adapter (`createShadowReadContainer` + Fake repos) | Tests green; flags false; no Firebase |
| **4A-1** | Production auth only (`FirebaseAdminProductionIdentityVerifier`) | Token verify; mock forbidden; no data reads |
| **4A-2** | Countries / cities | Allowlist; scope; observability; comparison |
| **4A-3** | Trips small date range (default 7d, max 31d) | Query budget; cursor page; no writes |
| **4A-4** | Drivers | PII masked; scope; no approval UI |
| **4A-5** | Agents | Country scope; no assignment mutations |
| **4A-6** | Customer masked summary | Default redacted; audit on full PII |
| **4A-7** | Safe financial fields | READ_SAFE / READ_WITH_WARNING only; block DO_NOT_EXPOSE_YET |

## Per-step mandatory checks

1. Unit + contract tests pass  
2. Observability events emit (no sensitive logs)  
3. Shadow comparison for safe fields (when both sides available)  
4. No writes / no mutation routes against Production repos  
5. No scope expansion / no PII leak  

## Explicitly deferred

- Settlement V2 / ledger / refunds / chargebacks  
- Export  
- Full PII by default  
- Any Production write path  

## Kill

`PRODUCTION_READ_ENABLED=false` at any step — see `ROLLBACK_SPEC.md`.

# ROLLBACK_SPEC

## Primary rollback

Set `PRODUCTION_READ_ENABLED=false`.

Effects:

- All Production repository calls reject (`PRODUCTION_READ_DISABLED`)  
- No Legacy / customer / driver / DB restore needed  
- No customer app impact (Admin Next failure is isolated)

## Secondary

- `PRODUCTION_READ_MODE=disabled`  
- Open circuit breaker / feature flag to hide Shadow nav  
- Rotate Production read credentials if exposure suspected  

## Non-goals

- Do not modify Legacy to roll back Admin Next  
- Do not enable write flags during rollback  
- Do not fall back silently to synthetic data on Production screens  

## Drill

Staging fake: flip kill switch and confirm UI shows “Production data unavailable”.

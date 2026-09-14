# PHASE_4A_GO_LIVE_CHECKLIST

Shadow pilot only — **not** settlement go-live.

## Preconditions

- [ ] Phase 4 design score ≥ 90 and critical design blockers = 0
- [ ] All safety flags still false until explicit flip of **read only**
- [ ] `PRODUCTION_WRITE_ENABLED` and domain write flags remain **false**
- [ ] `AUTH_MODE=verified_token`, `APP_ENV=production`
- [ ] `EXPECTED_PROJECT_ID` matches Production fingerprint
- [ ] Read-only dedicated credential provisioned (Secret Manager)
- [ ] Canary allowlist / pilot `auditor` (or read-only) role confirmed
- [ ] Observability dashboards for events in `OBSERVABILITY_SPEC.md`
- [ ] Rollback owner identified; kill switch drill completed on staging fake
- [ ] Legacy baseline post-check clean of Admin Next edits
- [ ] Export still disabled; settlement UI hidden; mutation actions not rendered
- [ ] PII default masked; DO_NOT_EXPOSE_YET fields absent from responses

## First enable

1. Deploy Admin Next build with Production read code behind flags (still false)  
2. Enable canary: `PRODUCTION_READ_MODE=shadow` + `PRODUCTION_READ_ENABLED=true` for allowlisted admins only  
3. Run 4A-1 → 4A-2 smoke  
4. Watch denials / mapping warnings / circuit breaker  

## Abort

Any kill condition → `PRODUCTION_READ_ENABLED=false` immediately.

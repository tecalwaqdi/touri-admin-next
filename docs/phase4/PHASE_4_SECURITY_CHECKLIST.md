# PHASE_4_SECURITY_CHECKLIST

- [x] Production read/write flags default **false**
- [x] `PRODUCTION_READ_MODE` default **disabled** (shadow only when explicitly designed later)
- [x] Read/write flags not coupled; shadow forbids write flags true
- [x] Resource-specific repositories (no generic Firestore query)
- [x] Collection allowlist default DENY
- [x] Field ALLOWLIST (unknown denied); DO_NOT_EXPOSE_YET blocked
- [x] PII masked by default; full needs `*:read_pii`
- [x] Scope expansion DENY design + tests
- [x] Identity verifier design fail-closed; unimplemented Admin verifier denies
- [x] Kill switch rejects Production repo calls
- [x] Shadow container has only Disabled write ports
- [x] No `createProductionWriteContainer`
- [x] Mutation route inventory mapped to write-disabled trap
- [x] Observability events without sensitive payloads
- [x] Circuit breaker → unavailable (not synthetic fallback)
- [x] Environment fingerprint design
- [x] Threat model reviewed (this phase)
- [ ] Firebase Admin Production verifier **implemented** (Phase 4A)
- [ ] Real Production credentials in Secret Manager (Phase 4A ops)
- [ ] Live canary against Production (Phase 4A — not now)

**Settlement / Accounting remain BLOCKED.**

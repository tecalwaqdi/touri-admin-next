# PHASE_4_READ_THREAT_MODEL

| Threat | Attack | Mitigation (design) | Residual |
|---|---|---|---|
| Auth spoof | Forge `x-user-id` / role headers | `AUTH_MODE=verified_token` required for staging/prod; header auth denied outside development | Medium until Admin SDK live |
| Scope escalation | Client sends other `countryId` / `agentId` / `global=true` | `enforceReadScope` DENY or force authorized filter; server builds filter before query | Low if enforced on all routes |
| PII disclosure | Request full phone/email | Default REDACTED; needs `*:read_pii`; audit `sensitive_field_read` | Medium (role over-permission) |
| Generic query | `/api/read?collection=` | Forbidden paths; resource-specific repos only; collection allowlist default DENY | Low |
| DoS / unbounded read | Huge limit / recursive scan | `MAX_PAGE_SIZE=100`; cursor pagination; trip date window; query budget; circuit breaker | Medium |
| Token replay | Stolen Bearer token | Expiry + skew; short sessions; future revocation / authTime checks | Medium |
| Stale claims | Role changed but token old | Prefer short TTL; future claims refresh / disable check on each verify | Medium |
| Mapping corruption | Wrong status/money mapping | `mappingWarnings`; mismatch → `MAPPING_MISMATCH`; never auto-fix Legacy | Medium |
| Env mix-up | Point at wrong Firebase project | `EXPECTED_PROJECT_ID` fingerprint; FAIL STARTUP / gate DENY | Low if enforced |
| Synthetic/production mix | Silent fallback to fixtures | Homogeneous identity assert; degraded = "Production data unavailable" | Low |
| Accidental write | Mutation hits Production | Write flags false; DisabledWriteRepository; no write container factory; multi-gate denies if write flags true | Low |

## Kill conditions

See `docs/legacy-mapping/PHASE_4_KILL_CONDITIONS.md` + `ROLLBACK_SPEC.md`.

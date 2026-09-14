# PHASE_4_KILL_CONDITIONS

Immediate kill / disable Production Read if any:

1. `PRODUCTION_WRITE_ENABLED` or domain write flags flip true unexpectedly
2. Auth verification fails open (accepts mock / header spoof in staging/production)
3. Scope filter bypass detected (country/agent leakage)
4. PII full values returned without `*:read_pii`
5. `DO_NOT_EXPOSE_YET` financial fields appear in responses
6. Unmapped statuses treated as actionable / auto-mapped to nearest
7. Geography auto-picks ambiguous cities or relocates trip/driver
8. Settlement or accounting actions enabled on shadow path
9. Legacy Admin source modified by Admin Next agent processes
10. Observability shows rising auth denials correlated with successful data leaks

Kill action: set `PRODUCTION_READ_ENABLED=false`, rotate keys if any were introduced, freeze Phase 4.

# PHASE_4_PROPOSED_READ_SCOPE

**DESIGN ONLY — do not implement Production adapters in Phase 3.7.**

## Narrowest shadow slice

| Resource | Scope | Notes |
|---|---|---|
| Countries | list/detail | Canonical ids + currency metadata |
| Cities | list/detail | Alias-resolved; ambiguous → skip auto-pick |
| Trips | list/detail | status_code priority; unknown → unmapped display |
| Drivers | list/detail | Five orthogonal statuses; PII masked by default |
| Agents | list/detail | Country-scoped |
| Customers | summary only | phone/email masked unless `customers:read_pii` |
| Financial trip fields | READ_SAFE / READ_WITH_WARNING only | Via classification registry |

## Explicitly out / blocked

- `DO_NOT_EXPOSE_YET` financial fields (refund, chargeback, gatewayFee, adjustment)
- Settlement V2 full read (not high confidence for Phase 4 shadow)
- Any write / approval / agent mutation / settlement action
- Generic collection queries

## Preconditions

See Phase 4 DESIGN ONLY gate in `PHASE_3_7_REPORT.md`.

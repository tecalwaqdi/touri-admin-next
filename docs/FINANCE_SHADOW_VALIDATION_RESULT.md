# Finance Shadow Validation Result

**Date:** 2026-09-13  
**Mode:** READ-ONLY ADC (`PHASE_FINANCE_SHADOW=1`)  
**Project:** `tutorial-multi-language-70gx4j`  
**FINANCE_WRITE_ENABLED:** false  
**Production Finance writes:** 0  

## Verdict

| Gate | Result |
|---|---|
| Shadow validation | **SHADOW PASS** |
| Controlled Finance Rollout preparation | **PREPARED** after F6; FC-01 APPROVED 15%; FR1 pilot prep separate — see `docs/FINANCE_FR1_PILOT_PREPARATION.md` |
| Production Finance writes | **0** |

Safe summary: `.local/finance-shadow/live-safe-summary.json`

## Aggregate (live)

| Metric | Count |
|---|---|
| Records scanned | 22 (18 orders + 4 settlements) |
| Production reads | 3 |
| Deterministic findings validated | 166 |
| Clean matches | 166 |
| Mismatches | 0 |
| Missing-data | 42 |
| Policy-blocked | 60 |
| Currency conflicts (incl. missing) | 3 |
| Settlement conflicts | 0 |
| Agent-attribution conflicts | 0 |
| Duplicate/idempotency conflicts | 0 |
| PII violations | 0 |
| Countries with multiple active agents | 0 |

### Mismatch categories

All implementation categories **0**: MAPPING_ERROR, CALCULATION_ERROR, ROUNDING, SETTLEMENT_CONFLICT, COUNTRY_AGENT_CONFLICT, LEGACY_DATA, UNKNOWN.

POLICY_UNRESOLVED tallied via policy-blocked findings: **60**.

### Policy-blocked by FC

| Code | Count | Topic |
|---|---|---|
| FC-01 | 17 | Platform commission rate unapproved |
| FC-02 | 0 | Discount treatment (not hit in window) |
| FC-03 | 7 | Agent settlement Production GO |
| FC-04 | 18 | Chargeback accounting |
| FC-05 | 18 | Gateway fee |

## Implementation bugs found and fixed (offline)

Shadow against Production proved F2 mapping gaps; fixed without Production mutation:

1. `lifecycleCompleted` now honors `order.status_code`
2. `driverId` from `mndob_user` / `driverRef`
3. `countryId` from `countryRef` / `Rev_dolh`
4. Settlement `absoluteSettlementAmountMinor` + `periodStart`/`periodEnd`
5. Settlement currency no longer invents `SAR`
6. Claims linkage via `eligibleOrderIds` when nested claims absent

## Harness

```bash
PHASE_FINANCE_SHADOW=1 FINANCE_WRITE_ENABLED=false \
  npx vitest run src/test/live/finance-shadow-validation.test.ts
```

Default: SKIP. No CF deploy. No settlement/payout execution.

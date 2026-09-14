# SHADOW_COMPARISON_SPEC

## Purpose

Compare Admin Next mapped shadow reads against a trusted side (fixture or dual-read) for **safe fields only**.  
Mismatch → `MAPPING_MISMATCH`. **Never change Legacy** to “fix” Admin Next.

## Rules

| Check | Rule |
|---|---|
| Counts | Exact match within scope |
| Money | Exact **minor-unit** match for same persisted source field |
| FX | No arbitrary FX tolerance / conversion |
| Status | Canonical `status_code` only; unmapped flagged |
| PII | Compare masked forms unless both sides authorized for full |
| Forbidden | Do not compare `DO_NOT_EXPOSE_YET` fields |

## Service

`ShadowComparisonService` / `NoopShadowComparisonService` — **no Production wire** in Phase 4.

Events: `shadow_comparison_mismatch`.

## Out of scope

Settlement totals, ledger balances, refund/chargeback amounts.

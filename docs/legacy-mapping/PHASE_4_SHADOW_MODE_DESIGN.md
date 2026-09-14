# PHASE_4_SHADOW_MODE_DESIGN

**DESIGN ONLY**

## Principles

- **Legacy remains Source of Truth** for all mutations and operational truth
- Admin Next = **read-only display** shadow
- No mutations, ops actions, settlement, approval, or agent changes via Admin Next Production path

## Shadow comparison (safe fields only)

| Check | Rule |
|---|---|
| Counts | Exact match (trips/drivers/agents in scope) |
| Money | Exact minor-unit match when same persisted source field |
| FX | **No** arbitrary FX tolerance — no conversion |
| Status | Compare mapped `status_code` only; unmapped flagged |
| PII | Compare masked forms unless both sides authorized for full |
| Forbidden | Do not compare DO_NOT_EXPOSE_YET fields |

## Observability (design — no prod telemetry send in 3.7)

Counters / histograms:

- read request counts + latency
- mapping warnings
- unmapped status / city counts
- scope mismatches (cross_city)
- auth denials
- PII redactions
- API errors by code

## Mapping health page

Route design: `/admin-next-health/mapping`  
Phase 3.7 may run on **fixtures only** (no production Firestore).

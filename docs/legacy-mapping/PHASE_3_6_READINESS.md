# PHASE_3_6_READINESS

## Score V2 (honest)

| Area | Max | Before (P3.5) | After (P3.6) | Notes |
|---|---:|---:|---:|---|
| Trips | 15 | 13 | **13** | unchanged |
| Driver | 10 | 8 | **8** | unchanged |
| Customer | 5 | 4 | **4** | unchanged |
| Agent | 10 | 8 | **9** | historical attribution rule frozen (`unknown_historical`) |
| Geography | 5 | 3 | **3** | unchanged |
| Financial | 25 | 14 | **22** | policy freeze, availability, safety flags, FC READ closures, tests |
| Auth/RBAC | 10 | 7 | **7** | re-tested; still not connected to Firebase |
| Security | 10 | 6 | **6** | unchanged |
| Cloud Functions | 10 | 8 | **8** | unchanged |
| **Total** | **100** | **71** | **80** | |

Financial raised only because Admin Next now handles unknowns **safely and documentedly** — not by ignoring them.

## Blocker counts

| Kind | Count |
|---|---:|
| Critical blockers for **SAFE READ** | **0** |
| Critical blockers for **SETTLEMENT/ACCOUNTING** | ≥6 (rate policy, discount policy, agent attribution, derived net, chargeback accounting, VAT policy, …) |
| Auth Production Blockers | 4 (no live verify; unmapped roles; claim sync; mock login UI) |
| Dependency PHASE_4_BLOCKER | **none** (dev advisories formally accepted) |

## Phase 4 DESIGN ONLY gate

| Criterion | Required | Actual |
|---|---|---|
| readiness ≥ 85 | yes | **80** — FAIL |
| Critical Read Mapping Unknowns = 0 | yes | **0** — PASS |
| Production Write disabled | yes | PASS |
| Auth design complete | yes | Design yes; not connected — residual auth blockers |
| Financial fields classified | yes | PASS |
| Unknowns fail safely | yes | PASS |

## Recommendation

**NO-GO** for Phase 4 DESIGN ONLY (readiness 80 < 85).  
SAFE READ mapping unknowns cleared; raise remaining score via geo/auth/customer depth + human review before DESIGN ONLY.

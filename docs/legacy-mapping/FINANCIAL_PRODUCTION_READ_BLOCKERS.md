# FINANCIAL_PRODUCTION_READ_BLOCKERS

Phase 3.6 update — separate **BLOCKS SAFE READ** vs **BLOCKS FUTURE SETTLEMENT/ACCOUNTING**.

Production Read must remain **DISABLED** until SAFE READ blockers are empty **and** human review + adapter design complete.

---

## BLOCKS SAFE READ

| ID | Blocker | Status (3.6) | Notes |
|---|---|---|---|
| FIN-READ-01 | Incomplete majors coerced to 0 | **RESOLVED** | Mapper + `assertIncompleteNotZero` tests; availabilityStatus |
| FIN-READ-02 | Platform commission amount invent/recalc | **RESOLVED (FC-01 READ)** | Use `total_app`; rate stays null — not a read invent |
| FIN-READ-03 | Driver net invent 0 / wrong discount auto-apply | **RESOLVED (FC-02 READ)** | Persisted `total_mndob` displayable; DiscountTreatment unresolved ≠ invent |
| FIN-READ-04 | Historical agent forced to current agent | **RESOLVED (FC-05 READ)** | `unknown_historical` + null agentId; trip display OK |
| FIN-READ-05 | Chargeback reported as 0 | **RESOLVED (FC-07 READ)** | `not_represented` + amount null |
| FIN-READ-06 | VAT amount recomputed historically | **RESOLVED** | Read `total_vat` only |

**Critical SAFE READ unknowns remaining: 0**

---

## BLOCKS FUTURE SETTLEMENT / ACCOUNTING

| ID | Blocker | Class | Severity | Notes |
|---|---|---|---|---|
| FIN-SETTLE-01 | Platform commission **rate** Production policy (FC-01 future) | C / policy | Critical for rate KPIs & new trips | `human_approval_required` |
| FIN-SETTLE-02 | DiscountTreatmentPolicy unresolved (FC-02 future) | C / policy | Critical for unified settlement formula | productionApproved=false |
| FIN-SETTLE-03 | Historical agent attribution missing | D | Critical for **agent** settlement | `AGENT_ATTRIBUTION_UNKNOWN` |
| FIN-SETTLE-04 | Derived driver net without explicit policy | B | Blocks settlement eligibility | `DRIVER_NET_UNRESOLVED` |
| FIN-SETTLE-05 | Chargeback lifecycle for accounting claims | E | Do not claim chargebacks=0 | accounting block |
| FIN-SETTLE-06 | Gateway fee NOT FOUND | D | High | DO_NOT_EXPOSE_YET |
| FIN-SETTLE-07 | VAT rate / inclusive policy | E / policy | Medium–High | VatPolicy draft |
| FIN-SETTLE-08 | V1 misleading names (repCommission/deliveryFees) | C | High mapping hazard | Documented |
| FIN-SETTLE-09 | Multi-engine disagreement (V1/V2/V3) | C | High | FC-09 |
| FIN-SETTLE-10 | Wallet balance field alias | C | Medium | FC-06 |
| FIN-SETTLE-11 | Agent cash remittance not represented | D | Medium | Product gap |
| FIN-SETTLE-12 | Settlement status vocabulary ≠ Admin Next synthetic | C | Medium | |
| FIN-SETTLE-13 | Previous balance only via opening_balance adjustments | B/E | Medium | |
| FIN-SETTLE-14 | Agent settlement inclusion of agent due | policy | High | UNRESOLVED |

---

## Auth blockers (cross-link)

See `PRODUCTION_AUTH_DESIGN.md` + `AUTH_PRODUCTION_BLOCKERS.md`:
- No live verifyIdToken
- Unmapped partner/transport
- x-user-id rejected in staging/production (enforced)

## Dependency blockers

See `DEPENDENCY_PRODUCTION_GATE.md` — no PHASE_4_BLOCKER for runtime; formal ACCEPT of dev advisories. Re-audit before Production exposure.

## Rule

Enabling `PRODUCTION_READ_ENABLED` while any **BLOCKS SAFE READ** item is open = **NO-GO**.  
Settlement/accounting blockers may remain for read-only display design.

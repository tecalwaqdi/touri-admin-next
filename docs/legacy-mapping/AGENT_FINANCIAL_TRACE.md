# AGENT_FINANCIAL_TRACE

## Commission type

- **Percent of platform fee** (`total_app` / platformFeeMinor), **not** percent of gross fare, **not** fixed amount (primary Observed contract).
- Equation: `agent_amount_minor = round(platformFeeMinor * Agent_total / 100)`
- Evidence: `Admi/firebase/functions/agent_order_snapshot.js` (and Customer app copy).

## Rate storage

| Field | Where | Role | Confidence |
|---|---|---|---|
| `user.Agent_total` | Agent user profile | % 0–100 of platform fee | medium–high |
| Validated | `validateCommissionRatePercent` in `agent_country_assignment.js` | Rejects >100 / NaN | high |
| Snapshot | `order.agent_rate`, `agent_rate_type=percent_of_platform_fee` | FIN-9 immutable snapshot | medium (new orders) |
| `app_commission_percent` on agent | Commercial field | **Not** agent share formula; conflicts with platform rate story (FC-01) | low for trip majors |

## Country / contract

- Attribution: one **active** agent per country via `Rev_dloh_agent` + lock collection.
- Scope on snapshot: `agent_scope: country_exclusive`.
- Historical: orders may lack snapshot → country-scope reports only (FC-05).

## Settlement calc

- Agent amount **does not** deduct from driver net / VAT / gross (explicit comment in agent_order_snapshot).
- Whether Settlement V2 **includes** agent_amount in locked lines: **UNRESOLVED / partial** — settlement exposure primarily driver↔company cash/online positions from V2 accounting. Agent payout settlement path not fully proven as same SM.

## Cash responsibility

- **Not represented** as “agent holds trip cash” in order payment_status model.
- Cash held by **driver**; company exposure via signed cash position.
- Agent remittance of cash: **Not represented** in traced fields → Required by Admin Next as future design, invent nothing in Legacy mapping.

## Classification

| Concept | Class |
|---|---|
| Snapshot amount on new order | **A** |
| Historical without snapshot | **D** |
| Settlement inclusion of agent due | **E** |

## Phase 3.6 Canonical freeze

- Never attribute historical obligation to currently active country agent.
- Snapshot → use it; missing → `agentId=null`, `agentAttributionStatus=unknown_historical`.
- Blocks agent settlement/attribution, not trip display.
- Future trip design fields: `agentIdSnapshot`, `agentCommissionRateSnapshot`, `agentCommissionAmountSnapshot`, `agentPolicyVersion`.
- Rate-only ≠ invent amount as high confidence.

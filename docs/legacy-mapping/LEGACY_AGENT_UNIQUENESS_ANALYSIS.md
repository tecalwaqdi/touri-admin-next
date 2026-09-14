# Legacy Agent Uniqueness Analysis

## Question

Is one-active-agent-per-country enforced in UI only, backend, or not at all?

## Answer (evidence-based)

**Backend-enforced (server-authoritative) for create/assign/reassign/deactivate**, with lock collection — **plus** historical data may still contain multiple agents per country for attribution windows.

### Backend enforcement — HIGH confidence

File: `Admi/firebase/functions/agent_country_assignment.js`

- Collection lock: `agent_country_assignment/{countryDocId}`
- Callables: `assignActiveCountryAgent`, `reassignActiveCountryAgent`, `deactivateCountryAgent`, `updateCountryAgentAssignment`
- Error: `AGENT_COUNTRY_ALREADY_HAS_ACTIVE_AGENT`
- Comment: "One country = max one active agent (server-authoritative). Does NOT silently replace…"
- `createPanelUser` path also runs uniqueness before commit (index.js F3-C3 comment)

### UI / client

- Admin agent screens + `AdminAgentCountryLock` for country scoping
- `admin_user_creation.dart`: "Never fall back to direct Firestore for agents (uniqueness bypass)"

### Attribution caveats — MEDIUM

`finance_agent_attribution.dart` canonical contract:
- `multipleAgentsPerCountryPossible: true` historically
- Historical orders often lack per-order `agent_id` snapshot
- Rate from `Agent_total` as % of platform fee / `total_app`
- Prospective snapshot fields exist (`agent_id`, `agent_amount_minor`, …) written by `syncAgentSnapshotOnOrderCreate` for newer orders

## Verdict for Admin Next

| Concern | Status |
|---|---|
| Create uniqueness | Backend lock — high |
| Historical multi-agent countries | Possible — medium |
| Per-order agent on old trips | Often missing — derive/scopeOnly |
| Do not change Legacy data in Phase 3 | Confirmed |

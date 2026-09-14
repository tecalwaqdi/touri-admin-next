# Agent One-to-One Rule

**Official rule:** each country has at most one **active** agent.

`Country 1 <-> 0..1 Active Agent`

## Enforcement

Domain service: `src/domain/agent/AgentAssignmentPolicy.ts`

- `canActivateAgent` rejects activation when another active agent exists for the country.
- `validateSeed` ensures synthetic data never ships two actives for one country.
- Inactive/historical agents are allowed (see `AGT-SA-000` previous agent in seed).
- API: `POST /api/agents/activate` enforces the same rule and audits `agent_assignment_attempt_rejected`.

## Assignment history

Synthetic history records `effectiveFrom` / `effectiveTo` style windows (`activeFromUtc` / `activeToUtc`, plus `AgentAssignmentHistory`). Old trips remain attributed to the agent id captured on the trip — they are **not** reattributed when a new agent activates.

UI alone is not sufficient. Future Firestore locks (`country_agent_locks/{countryId}`) will reinforce this in later phases — not wired to Production in Phase 2.

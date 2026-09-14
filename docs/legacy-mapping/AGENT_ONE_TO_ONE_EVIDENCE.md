# AGENT_ONE_TO_ONE_EVIDENCE

## Where

- Lock collection: `agent_country_assignment/{countryDocId}`
- File: `Admi/firebase/functions/agent_country_assignment.js`
- Constant: `ASSIGNMENT_COLLECTION = 'agent_country_assignment'`
- Error: `AGENT_COUNTRY_ALREADY_HAS_ACTIVE_AGENT` (`ERR_CONFLICT`)

## How

Server callables (transactional):
- `assignActiveCountryAgent`
- `reassignActiveCountryAgent` (explicit replace — does not silent-swap on assign)
- `deactivateCountryAgent`
- `updateCountryAgentAssignment`

Comment in source: one country = max one active agent (server-authoritative); does **not** silently replace.

Also: `createPanelUser` path uniqueness before commit (index.js F3-C3).

## Lock

Firestore `runTransaction` around lock doc + agent user patches (`Isagent: true`, commercial rates).

## Failure

Conflict error when country already has active agent on assign.

## Race

Transaction serialization on lock document — **Observed** pattern; residual race if non-callable client writes bypass (rules + UI forbid direct agent create). Confidence: **high** for callable path; **medium** for absolute global impossibility of historical multi-agent data.

## Historical replacement

- Reassign callable updates lock to new agent.
- Old orders: FIN-9 snapshot freezes `agent_id` / amounts when present; pre-snapshot orders remain country-scope / possibly ambiguous (`agent_attribution_status: ambiguous` if >1 active at snapshot time).

## UI

Admin must not fall back to direct Firestore for agents (bypass note in `admin_user_creation.dart`).

## Verdict

**Backend-enforced one-active-agent-per-country** for modern assign path — **proven**. Historical multi-agent / missing snapshots remain Production Read concerns (FC-05).

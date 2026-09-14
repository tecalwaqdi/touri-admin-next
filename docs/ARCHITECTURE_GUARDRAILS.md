# Architecture Guardrails

1. Legacy is read-only reference only.
2. No production write capability until an explicit later phase.
3. Safety flags default `false`:
   - `PRODUCTION_READ_ENABLED`
   - `PRODUCTION_WRITE_ENABLED`
   - `GLOBAL_PRODUCTION_WRITE_ENABLED`
   - `FINANCE_WRITE_ENABLED`
   - `DRIVER_WRITE_ENABLED`
   - `AGENT_WRITE_ENABLED`
4. Startup fails if dangerous write flags are enabled in non-production.
5. Presentation layer never accesses Firestore.
6. Authorization is enforced in application/backend paths, not only by hiding UI.
7. One active agent per country (domain `AgentAssignmentPolicy`).
8. No invented Legacy field meanings.
9. No financial formulas without approved Financial Policy.
10. Missing financial data must not become `0` by assumption.
11. Audit sensitive actions with `correlationId`.
12. Secrets never shipped in client bundles.
13. Prefer kill switches over irreversible rollouts.
14. Stop after Phase 0+1 unless explicitly authorized to continue.

# TOURI TAXI ADMIN NEXT — PHASE 5B AGENT CONTROLLED WRITES IMPLEMENTATION REPORT

**Date:** 2026-09-12  
**Phase:** 5B Agent Controlled Writes (implementation + offline/fake/emulator validation)  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENTATION + FAKE TESTS + NON-PRODUCTION VALIDATION ONLY  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**UI wiring:** none (deferred)  
**Customer / Finance writes:** **not started**  
**Driver 5A:** **unchanged**

---

## implemented commands

| Command | Factory | Transition |
|---|---|---|
| `ActivateAgentCommand` | `createActivateAgentCommand` | `inactive→active`, `pending→active`, `suspended→active` |
| `DeactivateAgentCommand` | `createDeactivateAgentCommand` | `active→inactive` (optional reason; no transfer/replacement) |
| `SuspendAgentCommand` | `createSuspendAgentCommand` | `active→suspended` (requires `reasonCode` + optional sanitized note) |

Each command requires: `actor`, `agentId`, `countryId`, `expectedCurrentState`, `preconditionToken`, `idempotencyKey`, `correlationId`, plus `reasonCode` where required.

**No country inference.** Explicit `countryId` must match snapshot; mismatch → `COUNTRY_REASSIGNMENT_NOT_ALLOWED`.

Pipeline:

```
Command → Verified Actor → RBAC → Scope → Agent Domain Validation →
Precondition → One-country-one-Agent guard → Idempotency →
AUDIT_INTENT → Controlled Agent Write Repository → safe mutation → AUDIT_RESULT
```

Code: `src/application/controlled-writes/agents/*`

---

## state transition matrix

Proven states: `active`, `inactive`, `suspended`, `pending`, `unknown`.

| From | To | Action |
|---|---|---|
| inactive | active | activate |
| pending | active | activate |
| suspended | active | activate |
| active | inactive | deactivate |
| active | suspended | suspend |

Invalid → `INVALID_AGENT_STATE_TRANSITION`.

---

## one-country-one-active-Agent enforcement

**Rule:** ONE COUNTRY = MAX ONE ACTIVE AGENT (server-side).

- Activate when another active Agent exists for the same country → **DENY** `ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY`
- **No** auto-deactivate / merge / pick / replace
- Precondition lookup via `findActiveAgentIdForCountry`
- Re-checked inside Fake apply under a **per-country mutex** (concurrency-safe critical section)

---

## race/concurrency handling

- `preconditionToken` from updateTime / version / safe hash — re-checked at apply (no last-write-wins)
- Country uniqueness re-asserted inside `FakeAgentWriteRepository.apply` under `withCountryLock(countryId)`
- **Race:** two concurrent activates for the same country → **exactly one success**, other → `ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY`
- Different countries may each hold one active Agent independently

---

## RBAC

- Permission: **`agents:manage`** (introduced in `Permission` union + ROLE matrix)
- Allowed roles: `super_admin`, `operations_manager`, `country_admin`
- `agent_user` must **NOT** manage other Agents → hard DENY
- `support_agent` / `auditor` / `reporting_viewer` / finance roles: DENY
- Unknown / unlisted roles: DENY
- Server-side only (`assertAgentWriteRbac`)
- Failure code: `PERMISSION_DENIED`

---

## scope

- Uses **canonical Agent country** from loaded snapshot — **no country inference**
- `global` scope: allowed
- `country` scope: must include snapshot `countryId` (`actor.countryId` membership)
- `not_represented` / `unknown` / `unmapped` → `SCOPE_DENIED` for country-scoped actors
- Missing countryId for country-scoped actors → `SCOPE_DENIED`

---

## preconditions

Loaded via `AgentWriteLoadPort` (canonical Agent snapshot):

1. Exists → else `AGENT_NOT_FOUND`
2. Operational Agent / not `excludedNonAgent` → else `NOT_OPERATIONAL_AGENT`
3. Country represented on snapshot → else `PRECONDITION_FAILED`
4. `command.countryId` matches snapshot → else `COUNTRY_REASSIGNMENT_NOT_ALLOWED`
5. `expectedCurrentState` matches observed → else `PRECONDITION_FAILED`
6. `preconditionToken` matches → else `PRECONDITION_FAILED`
7. Proven state transition → else `INVALID_AGENT_STATE_TRANSITION`
8. Activate uniqueness → else `ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY`

Deactivate / suspend: no transfer / replacement / settle / move drivers / finance coupling.

---

## idempotency

- Required key: 8..128 chars `[A-Za-z0-9._:-]`
- Fingerprint: `agent|action|agentId|countryId|expectedState|token|reasonCode|note` (no PII)
- Same key + same fingerprint → `idempotent_replay` (no second write)
- Same key + different fingerprint → `IDEMPOTENCY_CONFLICT`

---

## audit

- `AUDIT_INTENT` before repository
- `AUDIT_RESULT` after (applied / denied / failed / idempotent_replay)
- Safe fields only: actor uid/role, action, agentId, countryId/kind, from/to states, reasonCode, idempotencyKey, correlationId
- Forbidden: phone, email, IBAN, bank, contracts, address, docs, display names
- `productionWriteExecuted` always **false** in Phase 5B

---

## repository implementations

| Implementation | Kind | Role |
|---|---|---|
| `FakeAgentWriteRepository` | `fake_agent_write` | Offline contract + race uniqueness |
| `EmulatorAgentWriteRepository` | `emulator_agent_write` | Synthetic emulator stand-in (`available` flag) |
| `DisabledAgentWriteRepository` | `disabled_agent_write` | Production runtime default |
| `ProductionAgentWriteRepository` | `production_agent_write_unreachable` | Structurally prepared; hard-locked unreachable |

Factory `createProductionRuntimeAgentWriteRepository()` always returns Disabled.  
Fake/emulator are not wired into Production DI.

Production gate: `GLOBAL_PRODUCTION_WRITE_ENABLED` **AND** `PRODUCTION_WRITE_ENABLED` **AND** `AGENT_WRITE_ENABLED` — all false → `PRODUCTION_WRITE_DISABLED` with **no Firestore mutation attempt**. Hard-lock remains active.

---

## fake tests

`src/test/unit/phase5b-agent-controlled-writes.test.ts` — **41 passed**

Covers: state matrix, Production gate/write trap, all 3 command happy paths (+ pending/suspended activate), one-country uniqueness deny, no auto-deactivate, **concurrent race → exactly one success**, multi-country actives, RBAC (auditor/support/agent_user DENY; country_admin/ops/super ALLOW), scope (out-of-country + not_represented/unknown/unmapped), preconditions (not found / not operational / excludedNonAgent / expected mismatch / token mismatch / invalid transition / country reassignment), idempotent replay + conflict, PII note validation, audit no-PII, stable error catalog, emulator unavailable + synthetic available.

---

## emulator tests

- **Real Firestore emulator:** **unavailable** in this environment (no emulator suite / no emulator process). Documented via `EmulatorAgentWriteRepository({ available: false })` → `INTERNAL_WRITE_FAILURE`.
- **Synthetic emulator path:** exercised with `available: true` (in-memory stand-in, not Production Firebase).
- **No Production substitute.**

---

## full test count

| Check | Result |
|---|---|
| `npm test` | **PASS** — **679 passed \| 2 skipped (681)** |
| Phase 5B suite | **41 passed** |
| Phase 5A suite | **36 passed** (unchanged) |
| Phase 5 readiness suite | **18 passed** (unchanged) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

---

## Production calls = 0

Confirmed: no Production Firebase read/write clients invoked by Phase 5B path. Fake/emulator only.

## Production writes = 0

Confirmed: all write flags remain false; hard-lock active; Disabled / unreachable Production repositories; write-trap tests pass.

Flags (must stay false):

- `PRODUCTION_WRITE_ENABLED=false`
- `GLOBAL_PRODUCTION_WRITE_ENABLED=false`
- `AGENT_WRITE_ENABLED=false`
- `DRIVER_WRITE_ENABLED=false` (5A unchanged)
- `CUSTOMER_WRITE_ENABLED` / `FINANCE_WRITE_ENABLED` untouched (not started)

---

## Agent Controlled Writes implementation score /100

**95 / 100**

Deductions: real Firestore emulator integration not available in this environment (−5). Synthetic emulator + exhaustive Fake matrix (including race uniqueness) cover the contract.

---

## GO | CONDITIONAL GO | NO-GO for the next non-Production phase

**GO** for the next **non-Production** integration phase (e.g. wire Fake/emulator command handlers behind disabled flags, still no UI→Firestore, still no Production enablement).

**NO-GO** for Production write activation (`AGENT_WRITE_ENABLED` / global write flags must remain **false**).

**STOP.** No Production writes enable. No Customer writes. No Finance.

---

## Artifacts

| Path | Role |
|---|---|
| `src/application/controlled-writes/agents/*` | Phase 5B implementation |
| `src/test/unit/phase5b-agent-controlled-writes.test.ts` | Exhaustive Fake matrix + race |
| `docs/PHASE_5B_AGENT_CONTROLLED_WRITES_IMPLEMENTATION_REPORT.md` | This report |
| `src/types/roles.ts` / `src/permissions/rbac.ts` | Introduced `agents:manage` |

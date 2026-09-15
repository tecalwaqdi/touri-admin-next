# Admin Next Controlled Write Matrix (PC-9 authoritative → PC-10)

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-9 Controlled Admin Writes  
**Baseline commit:** `f4a73a37f439ce3b410f4fdc51d276abd762ea83`  
**Date:** 2026-09-15  
**Authority:** This matrix is the source of truth for PC-10 cutover decisions.  
**Production posture:** ALL write flags **FALSE**. No deploy. No Production mutation.

## Classification legend

| Code | Meaning |
|---|---|
| `READY_EXISTING` | Full gated pipeline exists (API→actor→RBAC→scope→validation→flags→idempotency→service→repo→audit). Offline/Fake executable; Production path hard-locked false. |
| `PARTIAL` | Domain + gates partially wired; missing product surface, confirmation, or Production adapter deliberately locked. |
| `MISSING` | No safe controlled-write path yet. |
| `NOT_APPROVED` | Capability exists or is conceivable but not approved for Admin Next write surface. |
| `DANGEROUS_DEFER` | Unsafe to implement now (bulk cleanup, silent repair, claims mutation without dedicated approval). Prefer DEFER over insecure implement. |

## Global gates (Production must remain FALSE)

| Flag | Default | Role |
|---|---|---|
| `GLOBAL_PRODUCTION_WRITE_ENABLED` | false | Kill switch — required for any Production write |
| `PRODUCTION_WRITE_ENABLED` | false | Global Production write arm |
| `DRIVER_WRITE_ENABLED` | false | Driver resource arm |
| `AGENT_WRITE_ENABLED` | false | Agent resource arm |
| `CUSTOMER_WRITE_ENABLED` | false | Customer resource arm |
| `CUSTOMER_AUTH_WRITE_ENABLED` | false | Auth dual-write for customers (deferred) |
| `FINANCE_WRITE_ENABLED` | false | Finance / settlement Production arm |
| `GEOGRAPHY_WRITE_ENABLED` | false | Geography mutations (not implemented; gate only) |
| `NEXT_PUBLIC_CONTROLLED_WRITES_UI` | unset/false in Prod | UI chrome visibility only — never authorizes writes |

Hard locks preserved: domain `*_PRODUCTION_HARD_FALSE`, `CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled=false`, `Disabled*WriteRepository`, shadow mutation traps.

---

## Domain matrix

### W1 — Drivers

| Field | Value |
|---|---|
| Readiness | **READY_EXISTING** (offline/synthetic) · Production arm **CLOSED** |
| API | `POST /api/drivers/[id]/{approve\|reject\|needs_changes\|suspend}` |
| Service | `DriverWriteApiService` → `ControlledWritesService.executeDriverCommand` → `executeDriverControlledWrite` |
| Repo | `BridgedDriverWriteRepository` / `FakeDriverWriteRepository`; Production = `DisabledDriverWriteRepository` |
| Collections (Prod, if ever armed) | Legacy `user` driver docs only via dedicated adapter (pilot Phase 5M/5N — **not** PC-9 Product path) |
| Permission | `drivers:approve` (server `resolveApiActor` + `requirePermission`) |
| Scope | Country / global via `DriverWriteScope` — no client role trust |
| Gate | GLOBAL ∧ DRIVER; hard Production lock; Fake uses `allowOfflineExecution` |
| Audit | Domain INTENT/RESULT + consolidated audit; collection `admin_next_cw_audit` (RO list in PC-4) |
| Idempotency | Header `idempotency-key` + domain + consolidated fingerprint |
| States | `pending_review→approved\|rejected\|needs_changes`; `approved↔suspended`; `needs_changes→pending_review` (resubmit internal) |
| Rollback | Reverse via legal transition only (suspend↔approve); no silent repair |
| Confirmation UX | AR/EN specific confirm templates (PC-9) |
| UI chrome | `DriverWriteActions` behind `isControlledWriteChromeEnabled()` |
| Notes | Legal transition matrix enforced; active-trip / readiness preconditions fail-closed |

### W2 — Agents

| Field | Value |
|---|---|
| Readiness | **READY_EXISTING** (offline/synthetic) · Production arm **CLOSED** |
| API | `POST /api/agents/[id]/{activate\|deactivate\|suspend}` |
| Service | `AgentWriteApiService` → `executeAgentCommand` |
| Repo | Bridged Fake; Production disabled |
| Permission | `agents:manage` |
| Scope | Country / global via `AgentWriteScope` |
| Gate | GLOBAL ∧ AGENT; hard Production lock |
| Audit / Idempotency | Same consolidation model as drivers |
| States | `inactive\|pending\|suspended→active`; `active→inactive\|suspended` |
| Invariant | **ONE COUNTRY = ONE ACTIVE AGENT** — fail-closed atomic (`AgentCountryUniqueness`); no auto-deactivate |
| Rollback | Deactivate / suspend only; never silent peer mutation |
| Confirmation UX | AR/EN + activate uniqueness warning |
| Notes | Country reassignment denied |

### W3 — Geography

| Field | Value |
|---|---|
| Readiness | **DANGEROUS_DEFER** |
| API | List/detail GET only (`/api/geography/...`) — **no mutation routes** |
| Gate | `GEOGRAPHY_WRITE_ENABLED=false` (env gate stub only) |
| Why defer | PC-6 DQ cleanup must not auto-delete/repair `cp5_*` / dirty IDs; no silent rename; landmarks/cities relation repair is high-risk |
| Approved later | Explicit create/update with allowlisted fields + audit — **not PC-9** |
| Notes | Safe DEFER > insecure implement |

### W4 — Finance (existing SoD only)

| Field | Value |
|---|---|
| Readiness | **PARTIAL** — offline Fake SoD commands READY; Production **CLOSED** |
| API (synthetic/dev) | `POST /api/settlements`, `POST /api/settlements/[id]/{submit\|approve\|reject\|close\|reverse}` |
| Service | `SettlementService` + V2 `SettlementCommandService` / `FinanceWriteGate` |
| Permission / SoD | create ≠ approve ≠ execute ≠ reverse (RBAC matrix preserved) |
| Gate | `FINANCE_WRITE_ENABLED=false`; Production FinanceWriteGate hard-denies; shadow traps deny settlements in Production read |
| Domain rules | **Inspect only** — no finance calc / Settlement V2 state-machine changes in PC-9 |
| UI | Create CTA / `/settlements/new` behind write chrome |
| Notes | Restore/expose existing SoD actions only when chrome + offline Fake; never arm Production |

### W5 — Customers

| Field | Value |
|---|---|
| Readiness | **READY_EXISTING** for disable/block/reactivate (offline) · **DANGEROUS_DEFER** for account deletion |
| API | `POST /api/customers/[id]/{disable\|block\|reactivate}` |
| Permission | `customers:manage` |
| Gate | GLOBAL ∧ CUSTOMER; `CUSTOMER_AUTH_WRITE_ENABLED=false` (Auth sync deferred) |
| States | `enabled→disabled\|blocked`; `disabled\|blocked→enabled` |
| Deletion | **NOT implemented** — compliant deletion only when dedicated approved path exists (PC-10+) |
| Guards | Membership / contamination / active-trip fail-closed |
| Confirmation UX | AR/EN specific |

### W6 — Users / Roles

| Field | Value |
|---|---|
| Readiness | **NOT_APPROVED** (read-only) |
| API | GET `/api/users`, `/api/users/[id]`, `/api/roles` only |
| Writes | None — no claims mutation, no role assign endpoint |
| Notes | Claims path requires separate security approval; RO unless approved |

---

## Architecture (mandatory path)

```
Browser (chrome visibility only)
  → API route (maybeShadowTrapResponse)
  → resolveApiActor (server token)
  → requirePermission (RBAC)
  → scope assert
  → validation (expectedCurrentState, reason)
  → feature gate (GLOBAL + resource flags; hard locks)
  → idempotency
  → ControlledWritesService / domain service
  → repository (Fake bridged | Disabled Production)
  → audit INTENT + RESULT
  → response (canonical error codes)
```

**Forbidden:** generic Firestore write endpoint · arbitrary patch · client Firestore · header role/scope trust · React→Firestore · SA JSON / ADC write · silent dirty-data repair · bulk destructive ops.

---

## Write exposure summary (PC-9)

| Surface | Exposed in Production UI | Executable Production write | Offline/Fake |
|---|---|---|---|
| Driver actions | No (chrome off unless `NEXT_PUBLIC_CONTROLLED_WRITES_UI`) | No | Yes (dev synthetic) |
| Agent actions | No | No | Yes |
| Customer actions | No | No | Yes |
| Geography mutations | No | No | No |
| Finance SoD | No (chrome gated) | No | Yes (in-memory) |
| Users/Roles writes | No | No | No |
| Generic write | **ZERO** | **ZERO** | N/A |

`GENERIC WRITE / ARBITRARY PATCH / CLIENT FIRESTORE / SA JSON / ADC / SYNTHETIC Production fallback = ZERO`

---

## PC-10 remaining (from this matrix)

1. Explicit Production write arming plan (per-resource, kill-switch, rollback) — **not** default-on.
2. Compliant customer deletion workflow (if legally required).
3. Geography controlled writes (create/update only; no PC-6 auto-cleanup).
4. Users/Roles claims path **only if** security-approved.
5. Pilot exclusion defaults on commercial dashboards.
6. Full E2E cutover checklist + Production write pilot under operator harness.

---

*End of controlled write matrix. Production flags remain FALSE. Do not deploy from PC-9 alone.*

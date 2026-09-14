# TOURI TAXI ADMIN NEXT — PHASE 5C CUSTOMER CONTROLLED WRITES IMPLEMENTATION REPORT

**Date:** 2026-09-12  
**Phase:** 5C Customer Controlled Writes (implementation + offline/fake/emulator validation)  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENTATION + FAKE TESTS + NON-PRODUCTION VALIDATION ONLY  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**UI wiring:** none (deferred)  
**Finance / settlement / account deletion:** **not started**  
**Driver 5A / Agent 5B:** **Production remains disabled**

---

## implemented commands

| Command | Factory | Transition |
|---|---|---|
| `DisableCustomerCommand` | `createDisableCustomerCommand` | `enabled→disabled` (requires `reasonCode` + optional sanitized note) |
| `BlockCustomerCommand` | `createBlockCustomerCommand` | `enabled→blocked` (requires `reasonCode` + optional sanitized note) |
| `ReactivateCustomerCommand` | `createReactivateCustomerCommand` | `disabled→enabled`, `blocked→enabled` (optional reason) |

Each command requires: `actor`, `customerId`, `expectedCurrentState`, `preconditionToken`, `idempotencyKey`, `correlationId`, plus `reasonCode` where required.

**Scope of mutations:** application/account operational state only.  
**Not in scope:** delete account, hard delete Auth, delete profile, change country, wallet/refund/payment/booking/trip mutation, financial correction, PII edit, phone/email change.

Pipeline:

```
UI → Customer Application Command → Verified Actor → RBAC → Scope →
Membership Validation → Precondition → State Transition → Idempotency →
AUDIT_INTENT → Controlled Customer Write Repository → Safe Transaction → AUDIT_RESULT
```

Never UI→Firestore.

Code: `src/application/controlled-writes/customers/*`

---

## Customer transition matrix

Proven states: `enabled`, `disabled`, `blocked`, `deleted`, `unknown`.

| From | To | Action |
|---|---|---|
| enabled | disabled | disable |
| enabled | blocked | block |
| disabled | enabled | reactivate |
| blocked | enabled | reactivate |

Invalid → `INVALID_CUSTOMER_STATE_TRANSITION`.

Explicitly denied (no recreate/restore deleted):

- `deleted→enabled`, `deleted→blocked`
- `unknown→enabled`, `unknown→blocked`
- `disabled↔blocked` (disable vs block remain semantically distinct via reason enums)

---

## membership protection

**Rule (4A-7):** Prove operational Customer before write:

`isCustomerCandidate && hasPositiveCustomerEvidence && !conflictingRole && !excludedNonCustomer && !excludedUnknownIdentity && isOperationalCustomer`

- Existence of `user/{uid}` alone is **not** sufficient → `NOT_OPERATIONAL_CUSTOMER`
- `excludedNonCustomer` / `excludedUnknownIdentity` → `NOT_OPERATIONAL_CUSTOMER`
- Missing positive evidence → `NOT_OPERATIONAL_CUSTOMER`

Enforced in `CustomerWriteMembership` + preconditions before any repository apply.

---

## shared-user contamination protection

Conflicting roles on shared Firestore `user` collection are rejected as `NOT_OPERATIONAL_CUSTOMER`:

Driver · Agent · SUPERADMIN · Finance · Country Admin · Partner · Transport · Tour Guide

Snapshot field `conflictingRole` + `excludedNonCustomer` flags carry the evidence; no write on contaminated identity.

---

## RBAC

- Permission: **`customers:manage`** (introduced in `Permission` union + ROLE matrix for `super_admin`, `operations_manager`, `country_admin`)
- Allowed roles: `super_admin`, `operations_manager`, `country_admin`
- `agent_user` — **no** automatic block/manage powers → hard DENY
- `support_agent` / `auditor` / `reporting_viewer` / finance roles: DENY (unless later explicitly listed + granted)
- Unknown / unlisted roles: DENY
- Server-side only (`assertCustomerWriteRbac`)
- Failure code: `PERMISSION_DENIED`

---

## scope

- Uses **canonical Customer country** from loaded snapshot — **no country inference** (phone/language/GPS/email/trip history/address forbidden)
- `global` scope: allowed
- `country` scope: must include snapshot `countryId` (`actor.countryIds` membership)
- Country-scoped + `not_represented` / `unknown` / `unmapped` → `SCOPE_DENIED`
- Missing countryId for country-scoped actors → `SCOPE_DENIED`

---

## geography-not-represented behavior

- **Global** actors **may** manage an operational Customer with `countryScopeKind=not_represented` (or unknown/unmapped) when membership is proven — policy allows geographyNotRepresented for global.
- **Country-scoped** actors **cannot** mutate geography-not-represented / unknown / unmapped → `SCOPE_DENIED`.

---

## preconditions

Loaded via `CustomerWriteLoadPort` (canonical Customer snapshot):

1. Exists → else `CUSTOMER_NOT_FOUND`
2. Operational Customer membership (4A-7) → else `NOT_OPERATIONAL_CUSTOMER`
3. `expectedCurrentState` matches observed → else `PRECONDITION_FAILED`
4. `preconditionToken` matches → else `PRECONDITION_FAILED`
5. Proven state transition → else `INVALID_CUSTOMER_STATE_TRANSITION`
6. Disable/block + `tripState=active` → `CUSTOMER_HAS_ACTIVE_TRIP`
7. Disable/block require `reasonCode` → else `REASON_REQUIRED`

---

## concurrency strategy

- `preconditionToken` from updateTime / version / safe hash — re-checked at apply (no last-write-wins)
- Fake apply serialized under **per-customerId mutex**
- Concurrent disable race on same customer → **exactly one success**, other → `PRECONDITION_FAILED`

---

## idempotency

- Required key: 8..128 chars `[A-Za-z0-9._:-]`
- Fingerprint: `customer|action|customerId|expectedState|token|reasonCode|note` (no PII)
- Same key + same fingerprint → `idempotent_replay` (no second write)
- Same key + different fingerprint → `IDEMPOTENCY_CONFLICT`

---

## audit

- `AUDIT_INTENT` before repository
- `AUDIT_RESULT` after (applied / denied / failed / idempotent_replay)
- Safe fields only: actor uid/role, action, customerId, countryId/kind, from/to states, reasonCode, idempotencyKey, correlationId
- Forbidden: phone, email, FCM, national ID, address, display names
- `productionWriteExecuted` always **false** in Phase 5C
- `authWriteExecuted` always **false** in Phase 5C

---

## active-trip guard

- Prefer **DENY** `CUSTOMER_HAS_ACTIVE_TRIP` when `tripState=active` on disable/block
- **No** auto-cancel trips
- Re-checked inside Fake apply under customer lock
- Safety preferred over Legacy mid-trip permissive behavior (documented: Controlled Writes deny; Legacy may differ)

---

## Auth-vs-app-state strategy

- Prefer **Firestore application/account state only** for Phase 5C transitions (`accountEnabled` / `operationalState`)
- Auth disable/enable sync is a **later step**
- Prepared hook: `ProductionCustomerWriteRepository.prepareAuthSync` behind `CUSTOMER_AUTH_WRITE_ENABLED=false` + hard lock → `AUTH_WRITE_DISABLED`
- **No hidden dual writes**

---

## Finance isolation

- No wallet / payment / refund / settlement / chargeback / coupon / balance mutation on command surface or repository
- `FINANCE_WRITE_ENABLED` untouched / not started
- Command types have no financial fields

---

## repository implementations

| Implementation | Kind | Role |
|---|---|---|
| `FakeCustomerWriteRepository` | `fake_customer_write` | Offline contract + concurrency |
| `EmulatorCustomerWriteRepository` | `emulator_customer_write` | Synthetic emulator stand-in (`available` flag) |
| `DisabledCustomerWriteRepository` | `disabled_customer_write` | Production runtime default |
| `ProductionCustomerWriteRepository` | `production_customer_write_unreachable` | Structurally prepared; hard-locked unreachable |

Factory `createProductionRuntimeCustomerWriteRepository()` always returns Disabled.  
Fake/emulator are not wired into Production DI.

Production gate: `GLOBAL_PRODUCTION_WRITE_ENABLED` **AND** `PRODUCTION_WRITE_ENABLED` **AND** `CUSTOMER_WRITE_ENABLED` — all false → `PRODUCTION_WRITE_DISABLED` with **no Firestore mutation attempt**. Hard-lock remains active.  
`CUSTOMER_AUTH_WRITE_ENABLED=false`.

---

## fake tests

`src/test/unit/phase5c-customer-controlled-writes.test.ts` — **51 passed**

Covers: state matrix, Production gate/write trap, Auth write disabled, all 3 command happy paths (+ reactivate from blocked), membership (exists-only / excludedNonCustomer / excludedUnknownIdentity), shared-user contamination for 8 conflicting roles, RBAC (auditor/support/agent_user DENY; country_admin/ops/super ALLOW), scope (out-of-country + not_represented/unknown/unmapped), geography-not-represented global ALLOW, preconditions (not found / expected mismatch / token mismatch / deleted+unknown deny / active-trip), concurrent race → exactly one success, idempotent replay + conflict, REASON_REQUIRED, PII note validation, audit no-PII, stable error catalog, emulator unavailable + synthetic available, Finance isolation.

---

## emulator tests

- **Real Firestore emulator:** **unavailable** in this environment (no emulator suite / no emulator process). Documented via `EmulatorCustomerWriteRepository({ available: false })` → `INTERNAL_WRITE_FAILURE`.
- **Synthetic emulator path:** exercised with `available: true` (in-memory stand-in, not Production Firebase).
- **No Production substitute.**

---

## full test count

| Check | Result |
|---|---|
| `npm test` | **PASS** — **730 passed \| 2 skipped (732)** |
| Phase 5C suite | **51 passed** |
| Phase 5B suite | updated helper (Finance still not started) |
| Phase 5A suite | **36 passed** (Production still disabled) |
| Phase 5 readiness suite | unchanged contract |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

---

## Production calls = 0

Confirmed: no Production Firebase read/write clients invoked by Phase 5C path. Fake/emulator only.

## Production writes = 0

Confirmed: all write flags remain false; hard-lock active; Disabled / unreachable Production repositories; write-trap tests pass.

Flags (must stay false):

- `PRODUCTION_WRITE_ENABLED=false`
- `GLOBAL_PRODUCTION_WRITE_ENABLED=false`
- `CUSTOMER_WRITE_ENABLED=false`
- `CUSTOMER_AUTH_WRITE_ENABLED=false`
- `DRIVER_WRITE_ENABLED=false` (5A unchanged)
- `AGENT_WRITE_ENABLED=false` (5B unchanged)
- `FINANCE_WRITE_ENABLED` untouched (not started)

---

## Customer Controlled Writes implementation score /100

**95 / 100**

Deductions: real Firestore emulator integration not available in this environment (−5). Synthetic emulator + exhaustive Fake matrix (including membership contamination + concurrency + active-trip) cover the contract.

---

## GO | CONDITIONAL GO | NO-GO for Controlled Writes integration consolidation

**GO** for the next **non-Production** Controlled Writes integration consolidation phase (wire Fake/emulator command handlers behind disabled flags, still no UI→Firestore, still no Production enablement).

**NO-GO** for Production write activation (`CUSTOMER_WRITE_ENABLED` / `CUSTOMER_AUTH_WRITE_ENABLED` / global write flags must remain **false**).

**STOP.** No Production writes enable. No Finance. No account deletion.

---

## Artifacts

| Path | Role |
|---|---|
| `src/application/controlled-writes/customers/*` | Phase 5C implementation |
| `src/test/unit/phase5c-customer-controlled-writes.test.ts` | Exhaustive Fake matrix |
| `docs/PHASE_5C_CUSTOMER_CONTROLLED_WRITES_IMPLEMENTATION_REPORT.md` | This report |
| `src/types/roles.ts` / `src/permissions/rbac.ts` | Introduced `customers:manage` |

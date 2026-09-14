# Architecture

## Layering

```text
src/app            → Next.js App Router (pages, API routes, error boundaries)
src/components     → Presentation (layout, guards, states)
src/features       → Feature UI compositions
src/application    → Application services / commands (settlements, reports, dashboard)
src/domain         → Domain rules (Money, FinancialTrip, Ledger, Settlement SM, Agent policy)
src/repositories   → Repository interfaces + InMemory adapters
src/infrastructure → Auth mock, logging, API auth helpers
src/auth           → Session / auth state machine
src/permissions    → RBAC + scope
src/audit          → Audit service
src/i18n           → Arabic RTL / English LTR
src/config         → Env validation + safety flags + navigation
```

## Dependency rule

- UI → Application / Auth / Permissions
- Application → Domain + Repository interfaces
- Infrastructure implements repository / auth interfaces
- **UI must not import Firestore or production SDKs**
- **No Production\* adapters** in Phase 2

## Auth state machine

`initializing → unauthenticated | authorizing → authorized | forbidden | error`

Session, permission, and data query states are separate to avoid remount flicker.

## Data query states

`idle | loading | success | empty | error`

Shared UI: LoadingState, EmptyState, ErrorState, ForbiddenState, OfflineState.

## Repositories (Phase 2)

Interfaces: Trip, Driver, Customer, Agent, Finance, Settlement, Audit, User, Ledger.  
Adapters: InMemory / Mock / Synthetic only. No production Firebase.

## Financial boundary

- `SyntheticFinancialPolicyProvider` (`SYNTHETIC_TEST_POLICY`, `productionApproved: false`)
- All money math via `Money` + `FinancialCalculationService`
- Synthetic CoA + balanced journals; posted entries immutable
- Settlements: dual control, eligibility, close → journal, reverse only for corrections

## Phase 3 — Legacy mapping (no adapters)

Discovery artifacts live in `docs/legacy-mapping/` and `docs/PHASE_3_REPORT.md`.  
**No** `ProductionFirestoreRepository` / Production Read adapters. Production flags remain false.
Auth: `x-user-id` / mock bearer allowed only when `APP_ENV=development`.

# Touri Taxi Admin Next

Independent admin console for Touri Taxi. **Not** a fork or branch of Legacy Admin.

## Phase status

- **Phase 0:** Freeze / Protect / Isolate — complete
- **Phase 1:** Foundation (Auth, RBAC, Scope, Layout, i18n, Audit, mocks) — complete
- **Phase 2:** Synthetic Vertical Slice (Money, Financial Trip, Ledger, Settlements, Audit UI, Reports) — complete
- **Phase 3:** Legacy Discovery & Mapping — complete (docs only; Production Read still disabled)
- **Phase 4+:** Not started (no Production Read adapters)

## Quick start

```bash
cp .env.development.example .env.development
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Mock login users (password for all: `password`):

| Email | Role |
|-------|------|
| `super@touri.local` | super_admin |
| `ops@touri.local` | operations_manager |
| `sa-admin@touri.local` | country_admin (SA) |
| `agent-sa@touri.local` | agent_user |
| `accountant@touri.local` | accountant |
| `approver@touri.local` | finance_approver |
| `auditor@touri.local` | auditor |
| `reporter@touri.local` | reporting_viewer |
| `disabled@touri.local` | disabled (forbidden) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Unit + integration tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict check |

## Isolation rules

- Workspace is fully independent of Legacy (`/Users/ventura/ara-ban`).
- No Production Firebase credentials.
- All production write flags default to `false`.
- UI never talks to Firestore directly — repositories only (InMemory / synthetic).
- Financial calculations use `SYNTHETIC_TEST_POLICY` only (`productionApproved: false`).

## Docs

- [PHASE_3_REPORT.md](docs/PHASE_3_REPORT.md) — Legacy discovery & mapping
- [legacy-mapping/](docs/legacy-mapping/) — inventory, status, finance, functions, blockers
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [LEGACY_PROTECTION.md](docs/LEGACY_PROTECTION.md)
- [ARCHITECTURE_GUARDRAILS.md](docs/ARCHITECTURE_GUARDRAILS.md)
- [ENVIRONMENTS.md](docs/ENVIRONMENTS.md)
- [RBAC.md](docs/RBAC.md)
- [AGENT_RULE.md](docs/AGENT_RULE.md)
- [SYNTHETIC_FINANCIAL_POLICY.md](docs/SYNTHETIC_FINANCIAL_POLICY.md)
- [SYNTHETIC_LEDGER.md](docs/SYNTHETIC_LEDGER.md)
- [SETTLEMENT_WORKFLOW.md](docs/SETTLEMENT_WORKFLOW.md)
- [REPORTING.md](docs/REPORTING.md)
- [SECURITY_DEPENDENCIES.md](docs/SECURITY_DEPENDENCIES.md)
- [DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [ROLLBACK.md](docs/ROLLBACK.md)
- [PHASE_0_1_REPORT.md](docs/PHASE_0_1_REPORT.md)
- [PHASE_2_REPORT.md](docs/PHASE_2_REPORT.md)

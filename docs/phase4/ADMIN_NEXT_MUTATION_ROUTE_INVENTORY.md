# ADMIN_NEXT_MUTATION_ROUTE_INVENTORY

Inventory of Admin Next API routes and how they stay off Production writes.

| Method | Path | Class | Shadow behavior |
|---|---|---|---|
| GET | `/api/trips` | read-only | allowed_read |
| GET | `/api/trips/[id]` | read-only | allowed_read |
| GET | `/api/drivers` | read-only | allowed_read |
| GET | `/api/drivers/[id]` | read-only | allowed_read |
| GET | `/api/agents` | read-only | allowed_read |
| GET | `/api/agents/[id]` | read-only | allowed_read |
| POST | `/api/agents/activate` | mutation | reject_production_write |
| GET | `/api/dashboard` | read-only | allowed_read (safe KPIs) |
| GET | `/api/audit` | read-only | allowed_read |
| GET | `/api/audit/[id]` | read-only | allowed_read |
| GET | `/api/reports` | read-only | allowed_read |
| GET | `/api/reports/export` | mutation* | hide_ui (DISABLED in 4A) |
| GET | `/api/settlements*` | read-only / hide | hide_ui (out of initial scope) |
| POST | `/api/settlements` | mutation | reject_production_write |
| POST | `/api/settlements/[id]/{submit,approve,reject,close,reverse}` | mutation | reject_production_write |

\*Export treated as sensitive side-effect surface — disabled in first 4A.

## Isolation rules

1. Today all mutations hit **synthetic** in-memory repos (`getRepositories()`).  
2. Shadow DI registers `DisabledWriteRepository` for any Production write port.  
3. Future trap tests: every mutation route → `PRODUCTION_WRITE_DISABLED` when Production ports are selected.  
4. Prefer **not rendering** mutation actions in Shadow UI (not merely disabled buttons).

Code mirror: `src/infrastructure/production/MutationRouteInventory.ts`.

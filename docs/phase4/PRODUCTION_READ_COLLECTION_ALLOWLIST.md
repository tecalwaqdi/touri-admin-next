# PRODUCTION_READ_COLLECTION_ALLOWLIST

**Default DENY.** Only listed collections may be read via resource-specific repositories.

## Allow (initial Phase 4A)

| Collection | Resource repo |
|---|---|
| `countries` | Geography |
| `cities` | Geography |
| `order` | Trips |
| `user` | Drivers / Agents / Customer summary / Admin panel personas (differentiated in repo, not generic query) |
| `admin_next_cw_audit` | Admin Next controlled-write audit (PC-4 RO; not `finance_audit_events`) |

## Deny / out of initial scope

`settlements`, `settlement_v2`, `ledger`, `journal`, `finance_controls`, `refunds`, `chargebacks`, `payment_gateway`, `admin_users_mutations`, `finance_audit_events` (finance-ops only — not Admin Audit UI)

## Rule

Unknown collection → `COLLECTION_DENIED`.  
No generic collection passthrough API.

Code: `src/infrastructure/production/contracts/CollectionAllowlist.ts`.

# PRODUCTION_READ_COLLECTION_ALLOWLIST

**Default DENY.** Only listed collections may be read via resource-specific repositories.

## Allow (initial Phase 4A)

| Collection | Resource repo |
|---|---|
| `countries` | Geography |
| `cities` | Geography |
| `order` | Trips |
| `user` | Drivers / Agents / Customer summary (differentiated in repo, not generic query) |

## Deny / out of initial scope

`settlements`, `settlement_v2`, `ledger`, `journal`, `finance_controls`, `refunds`, `chargebacks`, `payment_gateway`, `admin_users_mutations`

## Rule

Unknown collection → `COLLECTION_DENIED`.  
No generic collection passthrough API.

Code: `src/infrastructure/production/contracts/CollectionAllowlist.ts`.

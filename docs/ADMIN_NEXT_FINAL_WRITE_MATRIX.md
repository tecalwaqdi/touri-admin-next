# Admin Next — Final Write Matrix (Production)

**Authority:** Extends `docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md` for final cutover.
**Default Production:** ALL flags **false**. UI chrome **hidden** (`NEXT_PUBLIC_CONTROLLED_WRITES_UI=false`).
**Adapter posture:** Every legitimate domain has a **REAL** Production write adapter. Gate disabled ≠ Fake/Stub/Memory/Disabled adapter.

## Adapter classification (authoritative)

| Domain | Adapter class | Gate (default false) | Production runtime | Principal |
|---|---|---|---|---|
| Driver | **REAL** | `DRIVER_WRITE_ENABLED` | `production_driver_write` (+ CF `reviewDriverApplicationV2`) | `touri-admin-next-driver-review` |
| Agent | **REAL** | `AGENT_WRITE_ENABLED` | `production_agent_write` | `touri-admin-next-ops-writer` |
| Customer | **REAL** | `CUSTOMER_WRITE_ENABLED` | `production_customer_write` | `touri-admin-next-ops-writer` |
| Country | **REAL** | `GEOGRAPHY_WRITE_ENABLED` | `production_geography_write` | ops-writer |
| Region | **REAL** | `REGION_WRITE_ENABLED` | `production_geography_write` | ops-writer |
| City | **REAL** | `GEOGRAPHY_WRITE_ENABLED` | `production_geography_write` | ops-writer |
| Landmark | **REAL** | `GEOGRAPHY_WRITE_ENABLED` | `production_geography_write` | ops-writer |
| Vehicle Catalog | **REAL** | `VEHICLE_CATALOG_WRITE_ENABLED` | `production_p0_master_write` | ops-writer |
| Partner | **REAL** | `PARTNER_WRITE_ENABLED` | `production_p0_master_write` | ops-writer |
| Fleet | **REAL** | `FLEET_WRITE_ENABLED` | `production_p0_master_write` | ops-writer |
| Guide | **REAL** | `GUIDE_WRITE_ENABLED` | `production_p0_master_write` | ops-writer |
| Support | **REAL** | `SUPPORT_WRITE_ENABLED` | `production_support_write` | ops-writer |
| Notification | **REAL** | `NOTIFICATION_WRITE_ENABLED` | `production_notification_write` | ops-writer |
| Identity | **REAL** | `ADMIN_IDENTITY_WRITE_ENABLED` | `production_identity_write` | `touri-admin-next-identity-admin` |
| Finance | **REAL** | `FINANCE_WRITE_ENABLED` | Settlement V2 FR1–FR7 | `touri-admin-next-finance-writer` |

**FAKE/STUB/MEMORY/DISABLED_ADAPTER remaining for legitimate ops:** **NONE** (Fake remains offline/test only).

Code mirror: `src/infrastructure/production/writes/ProductionWriteAdapterMatrix.ts`.

## Activation order (operator-only — NOT executed in this phase)

1. **Driver** — synthetic `pending_review` only via approved CF/provision path
2. **Agent** — activate/deactivate after ONE-COUNTRY-ONE-AGENT review
3. **Customer** — disable/block/reactivate (no account deletion via Admin)
4. **Geography** — QA record create/edit/activate/deactivate/archive only
5. **Finance** — FR SoD on approved fixtures only
6. **Users/Roles** — after dedicated identity-admin WIF SA proven

## Gate summary

| Flag | Production default |
|---|---|
| `GLOBAL_PRODUCTION_WRITE_ENABLED` | false |
| `PRODUCTION_WRITE_ENABLED` | false |
| `DRIVER_WRITE_ENABLED` | false |
| `AGENT_WRITE_ENABLED` | false |
| `CUSTOMER_WRITE_ENABLED` | false |
| `CUSTOMER_AUTH_WRITE_ENABLED` | false |
| `GEOGRAPHY_WRITE_ENABLED` | false |
| `REGION_WRITE_ENABLED` | false |
| `VEHICLE_CATALOG_WRITE_ENABLED` | false |
| `PARTNER_WRITE_ENABLED` | false |
| `FLEET_WRITE_ENABLED` | false |
| `GUIDE_WRITE_ENABLED` | false |
| `SUPPORT_WRITE_ENABLED` | false |
| `NOTIFICATION_WRITE_ENABLED` | false |
| `ADMIN_IDENTITY_WRITE_ENABLED` | false |
| `FINANCE_WRITE_ENABLED` | false |
| `NEXT_PUBLIC_CONTROLLED_WRITES_UI` | false |

## Architecture path

```
API → actor → RBAC → scope → gate → validation → idempotency → concurrency
  → domain → REAL Production repo → WIF Firestore/Storage/Functions → audit
```

## Forbidden

- Generic write RPC / arbitrary Firestore patch from UI
- Production deletion / silent repair / CP5 auto-cleanup
- Enabling GLOBAL without per-resource validation
- Shadow-reader Auth Admin / write IAM
- Commercial driver targets for first pilot
- SA JSON / ADC write runtime / Owner / Editor

*No secrets in this document. WRITE_PILOTS EXECUTED: NO.*

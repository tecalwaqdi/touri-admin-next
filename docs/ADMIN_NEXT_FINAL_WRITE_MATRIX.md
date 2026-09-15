# Admin Next — Final Write Matrix (Production)

**Authority:** Extends `docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md` for final cutover.
**Default Production:** ALL flags **false**. UI chrome **hidden** (`NEXT_PUBLIC_CONTROLLED_WRITES_UI=false`).

## Activation order (operator-only)

1. **Driver** — `needs_changes` on verified synthetic `pending_review` only
2. **Agent** — activate/deactivate after ONE-COUNTRY-ONE-AGENT review
3. **Customer** — disable/block/reactivate (no account deletion via Admin)
4. **Geography** — QA record create/edit/activate/deactivate/archive only (`GEOGRAPHY_WRITE_ENABLED`)
5. **Finance** — FR SoD on approved fixtures only (`FINANCE_WRITE_ENABLED`)
6. **Users/Roles** — test admin identity only after dedicated identity-admin WIF SA proven (`ADMIN_IDENTITY_WRITE_ENABLED`)

Each step requires: prior read validation, IAM diff, audit path green, idempotency proof, rollback doc, and explicit env flag flip on Vercel **only** for that resource.

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
| `ADMIN_IDENTITY_WRITE_ENABLED` | false |
| `FINANCE_WRITE_ENABLED` | false |
| `NEXT_PUBLIC_CONTROLLED_WRITES_UI` | false |

## Pilot status (PREPARATION ONLY — EXECUTED: NO)

| Domain | Code readiness | Production armed | Notes |
|---|---|---|---|
| Driver | READY_EXISTING | NO | Package ready; synthetic only |
| Agent | READY_EXISTING | NO | Uniqueness invariant enforced |
| Customer | READY_EXISTING | NO | No deletion (NOT_APPLICABLE_TO_ADMIN) |
| Geography | READY_EXISTING | NO | No delete; archive/deactivate; no CP5 cleanup |
| Finance | READY_EXISTING (offline SoD) | NO | FR7 RO live; no React calc |
| Users/Roles | READY_EXISTING | NO | Persona → CF claims; see IDENTITY_WRITE_SECURITY |

## Forbidden

- Generic write RPC or arbitrary Firestore patch from UI
- Production deletion / silent repair / CP5 auto-cleanup
- Enabling `GLOBAL_PRODUCTION_WRITE_ENABLED` without per-resource validation
- Granting shadow-reader Auth Admin / broad write IAM
- Commercial driver targets for first pilot

*No secrets in this document. WRITE_PILOTS EXECUTED: NO.*

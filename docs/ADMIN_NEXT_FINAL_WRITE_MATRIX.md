# Admin Next — Final Write Matrix (Production)

**Authority:** Extends `docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md` for final cutover.  
**Default Production:** ALL flags **false**. UI chrome **hidden** (`NEXT_PUBLIC_CONTROLLED_WRITES_UI=false`).

## Activation order (operator-only)

1. **Driver** — `needs_changes` on verified synthetic `pending_review` only (`Pc10DriverWritePilotPackage`)  
2. **Agent** — activate/deactivate after ONE-COUNTRY-ONE-AGENT review  
3. **Customer** — disable/block/reactivate (no account deletion via Admin)  
4. **Geography** — **NOT_APPROVED** (read-only product)  
5. **Finance** — FR1–FR7 pilots remain separate; `FINANCE_WRITE_ENABLED` stays false until SoD sign-off  
6. **Users/Roles** — **SECURITY-BLOCKED** until dedicated WIF least-privilege claims mutation path is approved  

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
| `FINANCE_WRITE_ENABLED` | false |
| `NEXT_PUBLIC_CONTROLLED_WRITES_UI` | false |

## Pilot status (2026-09-15)

| Domain | Code readiness | Production armed | Notes |
|---|---|---|---|
| Driver | READY_EXISTING | NO | Package ready; operator picks safe synthetic id |
| Agent | READY_EXISTING | NO | Uniqueness invariant enforced |
| Customer | PARTIAL | NO | No deletion; auth dual-write deferred |
| Geography | MISSING | NO | Read-only |
| Finance | READY_EXISTING (offline) | NO | FR7 RO live |
| Users/Roles | SECURITY-BLOCKED | NO | No claims write adapter |

## Forbidden

- Generic write RPC or arbitrary Firestore patch from UI  
- Production deletion / silent repair  
- Enabling `GLOBAL_PRODUCTION_WRITE_ENABLED` without per-resource validation  
- Commercial driver targets for first pilot  

*No secrets in this document.*

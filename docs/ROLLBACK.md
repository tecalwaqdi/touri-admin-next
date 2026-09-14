# Rollback

## Principle

Rolling back or disabling Admin Next must never require rolling back Legacy apps, Functions, or Firebase Production.

## Phase 0/1 rollback

1. Stop the Admin Next process / undeploy Admin Next hosting only.
2. Leave Legacy Admin and apps untouched.
3. Restore previous Admin Next git tag if needed inside this repo only.

## Kill switches (future writes)

Even when write adapters exist later:

- `GLOBAL_PRODUCTION_WRITE_ENABLED=false` stops all production writes
- Domain flags (`FINANCE_WRITE_ENABLED`, `DRIVER_WRITE_ENABLED`, `AGENT_WRITE_ENABLED`) narrow blast radius

## Verification after rollback

- Legacy Admin still opens
- Customer / Driver apps unaffected
- No Production writes originated from Admin Next

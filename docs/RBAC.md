# RBAC

## Roles

- `super_admin`
- `operations_manager`
- `country_admin`
- `agent_user`
- `accountant`
- `finance_approver`
- `support_agent`
- `reporting_viewer`
- `auditor`

## Permissions (`resource:action`)

- `drivers:read`, `drivers:approve`
- `trips:read`
- `agents:read`
- `finance:read`
- `settlements:create`, `settlements:approve`
- `reports:export`
- `users:manage`
- `audit:read`

## Settlement dual control

- `accountant` can `settlements:create` (and submit)
- `finance_approver` can `settlements:approve` / reject / close / reverse
- Creator cannot approve own settlement (domain + API)
- Approve UI only renders when actor has `settlements:approve`; API also rejects

## Scope

`global | country | city | agent`

Country Admin cannot leave assigned countries. Agent users are limited to their agent scope. Support cannot access finance permissions. API routes record `permission_denied` audit events.

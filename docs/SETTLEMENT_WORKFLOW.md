# Settlement Workflow

## Pages

- `/settlements` — list + filters
- `/settlements/new` — party → period → currency → eligible/excluded → draft
- `/settlements/[id]` — detail, actions, timeline

## States

`draft` → `under_review` → `approved` → `closed` → `reversed`

Also: `under_review` → `rejected` → `draft`; `under_review` → `draft`

Illegal examples: `draft` → `closed` (rejected by `SettlementStateMachine`).

## Dual control

Creator **cannot** approve their own settlement (`SELF_APPROVAL_FORBIDDEN`). UI hides Approve without `settlements:approve`; API enforces the same.

## Closed immutability

Closed settlements are immutable. Corrections via `reverseSettlement()` / `POST .../reverse` only, which posts a reversing journal entry.

## Duplicate protection

A trip cannot appear in two **closed** settlements. Enforced in repository lookup + create/close validation + `idempotencyKey`.

## APIs

```
GET/POST /api/settlements
GET /api/settlements/:id
GET /api/settlements/eligibility
POST /api/settlements/:id/submit|approve|reject|close|reverse
```

Headers: `x-user-id`, `x-correlation-id`, `x-request-id`, `idempotency-key` (approve/close/reverse).

## Badge

Screens show **Synthetic financial calculation** / **SYNTHETIC DATA**.

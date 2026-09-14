# Trip Status Mapping

## Canonical machine field

`order.status_code` — shared constants in:
- `mndob-main/lib/core/toury_system_status_codes.dart`
- mirrored Admin/Customer copies

## Values (booking lifecycle)

| Legacy status_code | Meaning | Terminal? | Confidence |
|---|---|---|---|
| `pending_driver` | Waiting for driver | no | high |
| `awaiting_driver` | Legacy alias → pending | no | high |
| `pending` | Legacy assignable | no | medium |
| `driver_assigned` | Accepted | no | high |
| `driver_arriving` | En route | no | high |
| `driver_arrived` | At pickup | no | high |
| `trip_started` | Started | no | high |
| `trip_in_progress` | In progress | no | high |
| `completed` | Completed | yes | high |
| `trip_completed` | Legacy completed | yes | high |
| `cancelled_by_customer` | Customer cancel | yes | high |
| `cancelled_by_driver` | Driver cancel | yes | high |
| `cancelled_by_admin` | Admin cancel | yes | high |
| `cancelled` / `canceled` | Legacy cancel | yes | high |
| `expired` | Auto-expire | yes | high |

## Dual-write / display fields (NOT independent SoT)

| Field | Role | Evidence |
|---|---|---|
| `halh_text` | Arabic label dual-write | displayHalhForCode; driver/customer writes |
| `halh_order` | Enum-ish Paid/Pending/Canceled/Cash | Halh enum + payment UX |
| `halh` | Additional legacy string | OrderStatusHelper |

## Proven transitions (write sites)

| From (typical) | To | Writer | Evidence |
|---|---|---|---|
| (create) | `pending_driver` + payment_status paid/pending_cash | Customer CF `ngenius_payments` / booking service | createCashBooking / finalize |
| pending_driver | `driver_assigned` | Driver CF `acceptDriverOrder` / client fallback `driver_trip_service` | wallet_ops + trip service |
| assigned | `driver_arriving` | Driver trip service | driver_trip_service ~1306 |
| arriving | `driver_arrived` | Driver trip service | ~1006 |
| arrived/assigned | `trip_in_progress` | Driver trip service | ~529 |
| in progress | `completed` (+ cash → payment_status pending_cash) | Driver trip service | ~730 |
| completed cash | payment_status `cash_collected` | Driver confirm / Admin CF confirmCashCollectionV2 | ~835; cash_collection_realization |
| open | `cancelled_by_customer` | Customer cancel policy | touri_customer_cancel_policy |
| open | `cancelled_by_driver` | Driver trip service | ~892 |
| pending_driver (stale) | `expired` | Scheduled `autoCancelOrders` | custom_cloud_functions/auto_cancel_orders.js |

## Payment status (orthogonal)

| payment_status | Meaning | Confidence |
|---|---|---|
| `unpaid` | Unpaid | high |
| `pending_cash` / `cash_pending` / `cash_due` | Cash due | high |
| `cash_collected` | Cash confirmed | high |
| `processing` | Gateway processing | medium |
| `paid` / `captured` | Online paid | high |
| `failed` | Failed | medium |
| `refunded` | Refunded | medium |
| `chargeback` | Chargeback marker | low — UI only proven |

## Ambiguities

- Ops completion ≠ payment collected (FinancialAccountingEngine separates lifecycle vs payment).
- Arabic `halh_text` still used for legacy queries — dual SoT risk if status_code missing.

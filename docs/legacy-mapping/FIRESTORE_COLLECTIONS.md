# Firestore Collections

Evidence: `collection('...')` usage across Admin/Customer/Driver/Functions + `Admi/firebase/firestore.rules` match blocks + indexes.

## Core operational

| Collection | Purpose | Nested | Confidence |
|---|---|---|---|
| `order` | Trip/booking SoT | `order/{id}/mkss` | high |
| `user` | All personas | `user/{id}/fcm_tokens`, `ordaercart` | high |
| `countries` | Country config (VAT flag, currency) | — | high |
| `cities` | City cards | — | high |
| `villages` | City/region hubs (legacy geo) | — | high |
| `mkan` / `mkan2` | Landmarks / places | order2/mkan2 | high |
| `type_car` | Vehicle types + hourly rate `sr` | — | high |
| `transport_company` | Fleet companies | — | medium |
| `Settings` / `settings` | App settings | — | medium |
| `support` | Support tickets | — | medium |
| `chat` | Chat threads | — | medium |
| `ReviewsUser` | Reviews | — | medium |
| `locations` | Location docs | — | low |
| `bank` | Bank info | — | low |
| `Classification` | Classification | — | low |
| `cart` / `cart_maps` / `mapmap` | Cart/map helpers | — | low |
| `order2` / `order_mkss` / `listamaknorder` / `idlistorder` / `list_address` / `ADRESSUSER` / `demodelet` / `auto_num` / `mndob` / `scond` | Legacy/aux collections | various | medium–low |
| `ExtraHours` | Extra hours bookings | — | medium |
| `PaymentMethods` / `Paymenthistory` / `E-paymentduerequests` | Payment UX history | — | medium |

## Money / finance

| Collection | Purpose | Confidence |
|---|---|---|
| `wallets` | Driver/customer balances | high |
| `transactions` | Wallet ledger lines | high |
| `company_payments` | Driver→company payments | high |
| `wallet_withdrawals` | Withdrawal requests | medium |
| `payment_sessions` | N-Genius / booking payment sessions | high |
| `webhook_events` | Gateway webhooks | high |
| `financial_settlements` | Settlement drafts/settled | high |
| `financial_settlements/{id}/lines` | Settlement lines | high |
| `financial_settlements/{id}/events` | Settlement events | high |
| `financial_settlement_payments` | Settlement payment records | high |
| `financial_settlement_claims` | Claims / locks | medium |
| `financial_payment_allocations` | Payment allocations | medium |
| `financial_payment_allocation_claims` | Allocation claims | medium |
| `financial_settlement_idempotency` / `financial_settlement_counters` | Idempotency | medium |
| `financial_periods` | Accounting periods | high |
| `financial_adjustments` | Adjustments | medium |
| `financial_config` | Finance feature flags/config | medium |
| `financial_audit_events` | Finance audit | high |
| `financial_aggregation_metrics` | Aggregation metrics | medium |
| `financial_wallet_adjust_idempotency` | Wallet adjust idempotency | medium |
| `financial_realization_idempotency` | Cash realization idempotency | medium |
| `admin_financial_cache` | Cached finance views | medium |
| `agent_country_assignment` | One-active-agent lock per country | high |

## Admin / auth / notifications

| Collection | Purpose | Confidence |
|---|---|---|
| `admin_audit_log` | Panel audit | high |
| `admin_panel_notifications` | Admin alerts | medium |
| `driver_registration_notifications` / `driver_registration_events` / `driver_document_review_audit` / `admin_driver_review_queue` | Driver onboarding | medium |
| `driver_vehicle_plate_claims` | Plate uniqueness | medium |
| `ff_user_push_notifications` / `ff_push_notifications` / `notifications` / `notification_events` / `driver_notifications` | Push pipeline | medium |
| `email_verification_challenges` / `email_otp_rate_limits` / `email_otp_cooldown` | Email OTP | high |
| `fcm_tokens` (subcoll) | Device tokens | high |

## Ambiguous / LEGACY_ONLY

- `orders` (plural) — single hit; treat as LEGACY_ONLY / ambiguous vs `order`
- `users` (plural) — rare; SoT is `user`
- `Support` vs `support` — casing ambiguity

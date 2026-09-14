# ONLINE_PAYMENT_TRACE

Source-only trace (Customer CF + payment-api). No production gateway calls from Admin Next.

## Initiation

| Step | Evidence | Confidence |
|---|---|---|
| Create payment session | `createNGeniusPayment` / payment-api `payments/create.ts` | high |
| Quote | `verifiedBookingAmount` / `calculateBookingQuote` | high |
| Idempotency | `sessionIdFor(uid, idempotencyKey)` hash; booking idempotency key required | high |

## References

- Session collection: `payment_sessions`
- Gateway order id fields on session/order (`ngeniusOrderId` / related) — **Observed** in CF finalize paths
- Order created on successful finalize / webhook

## Gateway status → order update

| Event | Order/session effect | Confidence |
|---|---|---|
| Success finalize/webhook | `payment_status=paid`, majors written, lifecycle pending_driver | high |
| Failure | session failed / order not created or failed status | medium |
| Processing | `processing` payment_status (supported in status codes) | medium |

## Webhook

- CF: `exports` webhook handler with `webhookHeader` + `webhookSecret`
- payment-api: `POST /webhooks/ngenius`
- Duplicate protection: `webhookPayloadHash` + `webhookEventDocId` → claim doc; duplicate returns 200 `"duplicate"`  
  Evidence: `ngenius_payments.js` ~1693–1724. **high**

## Amount / currency

- Minors in halalas / currency from country (`currency_code` / fallback SAR)
- Refund amount capped to session `amount_halalas`

## Refund

- `refundNGeniusPayment` CF + payment-api `refundNGeniusOrder`
- Session fields: `refund_amount_halalas`, status `refunded` / `refund_pending`
- Order `payment_status=refunded` supported in status mapping (medium for all write sites)

## Failure / duplicate callback

| Protection | Evidence | Confidence |
|---|---|---|
| Webhook event doc claim | CF webhook_events / hash | high |
| Booking idempotent reuse | cash/online create logs `idempotent_reuse` | high |
| Settlement payment idempotency | separate (settlement_payments) | high |

## Gateway fee

**NOT FOUND** as persisted trip deduction in online pipeline → see matrix D_missing.

## Chargeback

**NOT FOUND** as N-Genius chargeback handler — UI marker only (FC-07). UNRESOLVED lifecycle.

## Phase 3.6 Canonical freeze

- Chargeback lifecycle NOT FOUND → `chargebackStatus=not_represented`, `chargebackAmount=null` (**NEVER 0**).
- Domain `Chargeback*` types only; `productionApproved=false`; no real gateway.
- FC-07 CLOSED for READ; blocks claiming chargebacks=0 for accounting.

# LEGACY_CASH_FLOW

Updated Phase 3.5 — distinguish cash states. Classify each: **Observed | Derived | Not represented | Required by Admin Next**. Invent nothing.

## State machine (Observed)

1. **Create cash booking** — `payment_status=pending_cash`, lifecycle `pending_driver`  
   Evidence: `ngenius_payments.js` createCashBooking path. **Observed**
2. **Accept** — must use `acceptDriverOrder` CF (wallet gate); client cash accept blocked. **Observed**
3. **Complete trip** — `status_code=completed`, often still `pending_cash`. **Observed**
4. **Confirm collection** — `payment_status=cash_collected` (driver confirm / Admin `confirmCashCollectionV2`). **Observed**

## Cash positions (who holds what)

| Concept | Representation | Classification |
|---|---|---|
| Cash collected from customer | `payment_status=cash_collected` + customer `total` as held | **Observed** (status) + **Derived** (amount = customerPaid when collected∧completed in V2) |
| Cash held by driver | V2 `cashHeldMinor = customerPaid` when cash channel collected | **Derived** |
| Cash owed to company (platform+VAT net of discount recon) | V2 `signedCashMinor = customerPaid − driverNet` | **Derived** |
| Cash to agent | — | **Not represented** on order |
| Cash held by agent | — | **Not represented** |
| Cash remitted by driver to company | Settlement payments / `payCompanyFromWallet` / company_payments | **Observed** (ops paths) — not same as trip field |
| Outstanding cash exposure | Settlement V2 outstanding / finance exposure | **Derived** / **Observed** in settlement docs |
| Agent remittance outstanding | — | **Not represented** → **Required by Admin Next** (design only) |

## Online contrast (Observed)

- Company/gateway holds funds; driver entitlement owed by company (`onlineRemainMinor`).

## Settlement directions (Observed)

- `DRIVER_PAYS_COMPANY` / `COMPANY_PAYS_DRIVER` in settlement_ledger / payments.

## NOT FOUND

- Classic bank GL cash book as SoT
- Automated chargeback cash reversal pipeline
- Agent-as-cashier trip cash trail

## Required by Admin Next (future — not invented in Legacy)

- Explicit agent cash responsibility fields if product needs them
- Clear remittance vs trip collection separation in Canonical Read Model (use null + incompleteReasons until proven)

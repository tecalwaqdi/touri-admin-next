# Legacy Financial Formulas

## A. Booking quote (Customer CF) — HIGH

File: `ara_oatan_app/firebase/functions/ngenius_payments.js` → `verifiedBookingAmount`

```
hourlyRate = type_car.sr (integer major)
baseFareHalalas = hourlyRate * 100 * bookingHours
discountHalalas = min(percent(additionalHours*hourlyRate*100, car.NesbahkKsm), cap car.TotalKsmUb)
amountHalalas = baseFareHalalas - discountHalalas
appFeeHalalas = percent(baseFareHalalas, 15)   // HARDCODED 15
vatHalalas = country.isvat ? percent(baseFareHalalas, country.vat) : 0
```

Majors written to order:

```
total_mndob2 = base/100
total_app = app/100
total_vat = vat/100
total = amount/100
total_mndob = (base - app - vat)/100
```

**Note:** Driver net uses **base**, not customer `total` (discount does not reduce driver net in this formula).

## B. Payment-api quote — HIGH (mirrors CF)

File: `services/payment-api/src/lib/pricing/booking.ts` → `calculateBookingQuote`

- Same structure; `platformFeePercent ?? 15`; VAT on base when `applyVat`.

## C. Admin FinancialEngine V1 aggregate — HIGH (read paid only)

File: `Admi/lib/core/finance/financial_engine.dart`

- Sums stored majors only when `OrderStatusHelper.isPaid`
- Does **not** recompute rates

## D. Admin FinancialAccountingEngine V2 — HIGH (reporting)

File: `financial_accounting_engine.dart`

Driver net resolution:
1. Prefer stored `total_mndob` if matches `gross - fee - vat` (±1 minor) → high
2. Else if matches `total - fee - vat` with ksm=0 → high
3. Else derive: `total - fee - vat` (DERIVED_FROM_TOTAL) or `gross - fee - vat` (DERIVED_FROM_GROSS_BASE)
4. Missing fee/vat → incomplete (null, not zero)

Cash position:
- `cashHeldByDriver` = customer paid (cash collected)
- `signedCashPosition` = held − driverNet (>0 driver owes company)

Online:
- `onlineHeldByCompany` = customer paid
- `onlineRemainingPosition` = held − driver entitlement

## E. Agent commission — MEDIUM

`agent_amount ≈ platformFee * Agent_total / 100` (share of company commission, not additive to customer total) — UI text in accountant drawer; snapshot on create for new orders.

## F. Settlement exposure — MEDIUM–HIGH

Settlement V2 callables in Admin functions (`settlement_ledger.js`, `settlement_payments.js`) aggregate cash/online entitlements from accounting lines.

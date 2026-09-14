# VAT_TRACE

## Source (write path) — HIGH

File: `ara_oatan_app/firebase/functions/ngenius_payments.js` → `verifiedBookingAmount`

```
vatHalalas = country.isvat === true
  ? percentOf(baseFareHalalas, country.vat)
  : 0
```

Mirrored: `services/payment-api/src/lib/pricing/booking.ts` (`applyVat` + `vatPercent`).

Persisted: `order.total_vat` via `bookingFinancialMajorsFromQuote`.

## Rate source

| Item | Value | Confidence |
|---|---|---|
| Gate | `countries.isvat === true` | high |
| Rate field | `countries.vat` (percent) | high |
| On order document | **amount only** (`total_vat`); rate **not** snapshotted on order in CF majors | medium (negative for rate field on order) |
| Agent `vat_percent` | Stored on agent commercial profile — **display/config**; not CF quote source | medium |

## Tax base

- **Base fare** (`baseFareHalalas`), same base as platform fee.
- **Not** customer payable after discount (discount does not reduce VAT base in Observed CF).

## Inclusive vs exclusive

- Formula treats VAT as **separate amount** alongside platform fee and driver net from base.
- Customer `total` = base − discount (**VAT not added into customer total** in Observed CF majors).
- Whether UX presents prices as VAT-inclusive to customers: **UNRESOLVED** (UI copy not fully proven as SoT).

## Rounding

`percentOf` → `Math.round(halalas * percent / 100)` (integer minors).

## Persisted / refund / settlement

| Stage | Behavior | Confidence |
|---|---|---|
| Persist | `total_vat` on order | high |
| Refund | Refunds gateway session amount; **does not recompute VAT split** in traced CF refund path | medium |
| Settlement V2 | Uses `recordedVatMinor` from stored field in accounting line | high |
| Re-rate at report time | V2 does **not** re-fetch country.vat to recompute | high |

## Classification

| Aspect | Class |
|---|---|
| `total_vat` amount | **A** |
| Rate on trip without country join | **E** Unknown |
| Customer-facing inclusive labeling | **E** / UNRESOLVED |

## Verdict

VAT **write path proven**. Trip-level rate provenance without country document → **UNRESOLVED** for Production Read of “VAT rate” alone.

## Phase 3.6 Canonical freeze

- Historical VAT: read stored `total_vat`; do **not** recompute with current country VAT.
- `vatRateAtTrip=null` if not historically proven on order.
- Future `VatPolicy` types exist with `productionApproved=false` until Owner/Accountant approval.

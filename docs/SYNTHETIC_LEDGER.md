# Synthetic Ledger

## Status

**NON-PRODUCTION.** Chart of Accounts codes are synthetic and must not be mapped to production ledgers.

`productionLedger: false` on every journal entry. `SYNTHETIC_COA_PRODUCTION = false`.

## Chart of Accounts (synthetic)

- `SYN-CASH`
- `SYN-BANK`
- `SYN-GATEWAY-CLEARING`
- `SYN-DRIVER-PAYABLE`
- `SYN-AGENT-PAYABLE`
- `SYN-PLATFORM-REVENUE`
- `SYN-VAT-PAYABLE`
- `SYN-REFUND-LIABILITY`
- `SYN-CHARGEBACK`
- `SYN-ADJUSTMENT`
- `SYN-SETTLEMENT-CLEARING`

## Rules

- JournalEntry + JournalLine
- Total Debit **must equal** Total Credit or posting is rejected (`UnbalancedJournalError`)
- After post: **immutable** — no edit/delete
- Corrections: **Reversal / Correcting entry only** (`JournalService.createReversal`)

## Settlement close

Closing a settlement posts a balanced synthetic journal:

- Debit `SYN-SETTLEMENT-CLEARING`
- Credit `SYN-DRIVER-PAYABLE` or `SYN-AGENT-PAYABLE`

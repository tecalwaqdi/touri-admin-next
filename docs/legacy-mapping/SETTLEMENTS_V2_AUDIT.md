# SETTLEMENTS_V2_AUDIT

Deep audit from Legacy **source** (`Admi/firebase/functions/settlement_ledger.js`, `settlement_payments.js`, related finance_controls). No live docs fetched.

## Collections

| Collection / artifact | Role | Confidence |
|---|---|---|
| `financial_settlements` | Settlement header (draft/locked/settled/voided/partially_paid) | high |
| Nested lines / claims | Order claims locked into settlement | high (code paths) |
| Events subdocs / audit writes | Timeline + periods().writeAudit | high |
| Settlement payments collection | pending/confirmed/reversed payments | high |
| Idempotency docs | `idempotencyDocId(uid, op, key)` | high |
| `finance_periods` | Period open assertions | medium–high |
| Operational `settlement_ledger` module | **Not** classic CoA GL | high |

## Party

- Driver↔company primary (directions `DRIVER_PAYS_COMPANY` / `COMPANY_PAYS_DRIVER`)
- Agent-as-settlement-party in same SM: **partial / UNRESOLVED**

## Period / currency

- Period checks via `assertPeriodOpen(db, { currency, ... })`
- Settlement carries `currency`
- Multi-currency precision: unsupported currencies excluded in V2 analyzeOrder

## Eligibility

From `financial_accounting_v2.analyzeOrder` → line.eligible when:
- paid ∧ lifecycle completed ∧ confidence ≠ incomplete ∧ recon OK
- Else exclusionReason: INCOMPLETE_FINANCIAL_DATA / NOT_COMPLETED / NOT_COLLECTED / etc.

## Amounts

- Built from accounting lines (platform, vat, driverNet, cash/online positions)
- Payments update `paidConfirmedMinor` / `outstandingMinor`
- Opening balances / adjustments via finance_controls affect exposure outstanding

## Creator / approver

- `createdBy`, `lockedBy`, `settledBy`, `voidedBy` on transitions
- Checker policy `enforceChecker` for void / dual-control patterns (self-approve flags in metadata)

## Status / lifecycle (Observed)

`draft` → (`refresh preview`) → `locked` → (`payments` → `partially_paid`) → `settled`  
or `voided` (not from settled without constraints)

Idempotent lock/settle/void/payment confirm.

## Payment / close / reversal

- createSettlementPayment (pending) → confirmSettlementPayment → may settle
- reverseSettlementPayment with reason + idempotency
- voidSettlement releases claims when locked

## Duplicate / idempotency

**Proven** per-op idempotency keys; completed idempotency returns prior result.

## Historical rates

- Uses **stored** order majors / line minors — does not re-fetch country VAT% or re-apply 15% at settle time (**Observed**)

## Auditability

- Events + periods audit writes + payment evidence fields — **operationally auditable**
- Still **not** a classic general ledger Chart of Accounts

## Gaps

- Full edge-case SM without live production docs: medium residual unknown
- Agent settlement parity with driver SM: UNRESOLVED
- Mapping to Admin Next synthetic statuses (under_review/approved/closed): **label Conflict** (see compare doc)

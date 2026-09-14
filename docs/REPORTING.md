# Reporting

## Synthetic reports (`/reports`)

1. Trip Financial Summary
2. Settlement Summary
3. Agent Summary
4. Driver Earnings Summary
5. Reconciliation Preview

All amounts are synthetic and use `SYNTHETIC_TEST_POLICY` via `FinancialCalculationService`.

## Integrity rule

Report `totalAmountMinor` **must equal** the sum of detail row `amountMinor` values (automated test).

## CSV export

- `GET /api/reports/export`
- Requires `reports:export`
- Audits `report_exported` with same correlation id
- Formula injection protection for cells starting with `=`, `+`, `-`, `@`

## Placeholders

PDF and Excel export buttons are placeholders only in Phase 2.

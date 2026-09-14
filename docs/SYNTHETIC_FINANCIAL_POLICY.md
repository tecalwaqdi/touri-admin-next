# Synthetic Financial Policy

## Identity

- `policyId`: `SYNTHETIC_TEST_POLICY`
- `version`: `1.0.0-synthetic`
- `environment`: `development`
- `productionApproved`: **false**

## Purpose

Provides deterministic, non-production rates for Admin Next Phase 2 so Financial Trip, Settlements, Ledger, and Reports can exercise end-to-end flows without claiming real Touri Taxi commercial rules.

## Rates (synthetic only)

| Component | Basis points | Notes |
|---|---|---|
| Platform commission | 1500 (15%) | Synthetic |
| Agent commission | 500 (5%) | Synthetic |
| VAT | 1500 (15%) | Synthetic; inclusive/exclusive treatment deferred |
| Gateway fee | 200 (2%) | Applied to non-cash only |

All calculations must go through `FinancialCalculationService`. UI must not hard-code formulas.

## Deferred real decisions

- Real country VAT rates and inclusive/exclusive tax treatment
- Real platform vs agent commission schedules by country/city
- Payment gateway fee schedules and settlement timing
- Refund / chargeback allocation between platform, agent, driver
- FX conversion rules for multi-currency reporting
- Cash vs online settlement netting rules

These are **not** final Touri Taxi formulas.

## Phase 3.6 distinction

Synthetic Phase 2 finance (`FinancialCalculationService` + this policy) is **separate** from Canonical historical read rules in `src/domain/canonical/*`. Do not use synthetic rates to recompute Legacy order history.

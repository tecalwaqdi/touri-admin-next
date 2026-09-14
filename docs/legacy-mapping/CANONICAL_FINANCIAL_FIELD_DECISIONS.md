# CANONICAL_FINANCIAL_FIELD_DECISIONS

Phase 3.6 Financial Policy Freeze.  
**Observed Legacy Behavior ≠ Future Business Policy.**

| Canonical Field | Historical Source | Fallback | Can Be Derived? | Settlement Eligible? | Confidence Requirement | Unknown Behavior | Future Source |
|---|---|---|---|---|---|---|---|
| grossFare | `order.total_mndob2` | null + missing | No invent | Yes if available | high (persisted) | null, incomplete | Same snapshot on trip |
| finalCustomerAmount | `order.total` | null + missing | No | Yes if available | high | null | Same |
| vatAmount | `order.total_vat` | null + missing | **No** historical recalc | Amount yes if persisted; rate policy separate | high for amount | null — never current country VAT | Approved VatPolicy + snapshot |
| vatRate | Not on order | null + unknown | No invent | No until snapshotted | proven snapshot only | `vatRateAtTrip=null` | VatPolicy.rateBps (draft) |
| platformCommissionAmount | `order.total_app` | null + incomplete | **No** recalc with today’s % | Amount yes if persisted | high | null — never invent 0 | Approved PlatformCommissionPolicy |
| platformCommissionRate | Not persisted on order | null + unknown | No (FC-01 future) | No until approved policy + snapshot | proven snapshot only | null — never hardcode 15 | FinancialPolicy (draft) |
| agentCommissionAmount | FIN-9 `agent_amount` / minor | null + missing | Rate-only ≠ invent amount | Only with snapshot | high if snapshot | null | agentCommissionAmountSnapshot |
| agentCommissionRate | `agent_rate` snapshot | null + missing | Display rate only | Not alone | medium | null | agentCommissionRateSnapshot |
| driverGross | `order.total_mndob2` | null | No | Yes if available | high | null | Same |
| driverDeductions | derived `total_app+total_vat` | null + missing | Yes (provenance) | With caveats | medium derived | null | Explicit policy |
| driverNet | `order.total_mndob` primary | proven Legacy formula as **derived** | Yes with formulaId | Derived **NOT** settlement-eligible without explicit policy | high persisted / medium derived | null — never 0; FC-02 discount not auto-applied | DiscountTreatmentPolicy + snapshot |
| cashCollected | payment_status proves cash | null | Derived when proven | When proven | medium | null | Payment lifecycle |
| onlineCollected | payment_status paid/captured | null | Derived when proven | When proven | medium | null | Payment lifecycle |
| refundAmount | Not on order snapshot | null + unknown | No | No | — | unknown / DO_NOT_EXPOSE_YET | payment_sessions |
| chargebackAmount | **NOT FOUND** | null + **not_represented** | No | No | — | **NEVER 0** | ChargebackPolicy (draft, no gateway) |
| gatewayFee | NOT FOUND on trip pipeline | null + missing | No | No | — | DO_NOT_EXPOSE_YET | Gateway fee schedule policy |
| adjustmentAmount | finance_controls not order | null + unknown | No on trip read | Via controls | — | DO_NOT_EXPOSE_YET | financial_adjustments |

## Distinctions

- **Synthetic Phase 2** (`FinancialCalculationService` + `SyntheticFinancialPolicy`) calculates **new synthetic** trips for Admin Next UX — **not** historical Legacy read.
- **Canonical historical read** preserves persisted majors; never recalculates history when today’s policy changes (`NO_HISTORICAL_RECALCULATION_RULE`).

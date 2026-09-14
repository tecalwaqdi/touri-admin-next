# Mapping Registry

Canonical concepts ↔ Legacy fields. Confidence definitions:
- **high** — write + read + formula agreement proven
- **medium** — strong read/UI + partial write
- **low / unknown** — incomplete; financial low/unknown ⇒ Production Read blocker

| Canonical | Legacy field(s) | Collection | Confidence | Evidence |
|---|---|---|---|---|
| Trip | `order` doc | order | high | schemas + CF/driver/customer writes |
| TripStatus | `status_code` (+ dual-write `halh_text`, `halh_order`) | order | high | TourySystemStatusCodes; driver_trip_service; ngenius_payments |
| PaymentStatus | `payment_status` (+ `cash_collection_status`, `halh_order` Paid) | order | high | TourySystemStatusCodes; cash confirm |
| CustomerPaid | `total` | order | high | bookingFinancialMajorsFromQuote |
| GrossBaseFare | `total_mndob2` | order | high | CF majors; FinancialEngine comments |
| PlatformFee | `total_app` | order | high | CF; FinancialEngine.platformFee |
| RecordedVat | `total_vat` | order | high | CF; FinancialEngine |
| DriverNet | `total_mndob` | order | high | CF; misleading legacy name `repCommission` in V1 engine |
| Discount | `ksm` | order | medium | FinancialAccountingEngine |
| TripCountry | `Rev_dolh` | order | high | order_record; agent attribution |
| TripDriver | `mndob_user` | order | high | driver claim writes |
| TripCustomer | `USER` | order | high | order_record |
| TripCity/Landmark | `vill`, `cities_user_now`, listamakn | order | medium | geo dual models |
| DriverAccountActive | `actev_mndob` | user | high | AdminDriverStatusTruth |
| DriverRegistration | `registration_status` / `submission_status` | user | high | admin_driver_status_truth |
| DriverOnline | `is_online` / `ngl` / `operational_status` | user | medium | AdminDriverStatusTruth |
| DriverOnTrip | `mndon_newacc` / ops busy | user | medium | AdminDriverStatusTruth |
| IsAgent | `Isagent` / `isagent` | user | high | panel_claims; rules |
| AgentCountry | `Rev_dloh_agent` | user | high | agent_country_assignment |
| AgentCommissionRate | `Agent_total` (% of platform fee) | user | medium | finance_agent_attribution |
| CountryVatRate | `vat` + `isvat` | countries | high | verifiedBookingAmount |
| PlatformFeeRate | **hardcoded 15%** in CF quote (not always country field) | — | high (for CF) | ngenius_payments.js:223 |
| CountryAppCommission | `app_commission_percent` on user/country | user/countries | low–medium | AMBIGUOUS vs hardcoded 15% |
| WalletBalance | `currentBalance` / `walletBalance` | wallets | medium | scripts + wallet ops |
| Settlement | `financial_settlements` | financial_settlements | high | settlement_ledger.js |
| AgentCountryLock | `agent_country_assignment/{countryId}` | agent_country_assignment | high | agent_country_assignment.js |
| Chargeback | `chargeback` bool / payment_status=chargeback | order | low | UI projection only; no gateway flow proven |
| Ledger (GL) | settlement_ledger module + financial_* | various | medium | Admin CF — not classic CoA |
| AuthRole | Auth claims + `isAdminRule` | Auth / user | high | panel_claims.js |

## Production Read blockers (financial)

Any financial field with confidence **low/unknown** blocks Production Read until reconciled:
- Live country `app_commission_percent` vs hardcoded 15% CF
- Chargeback amounts / lifecycle
- Historical agent attribution without snapshot
- Wallet field aliasing (`currentBalance` vs `walletBalance`)

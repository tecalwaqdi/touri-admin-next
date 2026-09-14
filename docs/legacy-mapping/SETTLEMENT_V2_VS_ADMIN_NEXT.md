# Legacy Settlement V2 vs Admin Next Synthetic Settlement

**Change neither.** Classification only.

| Dimension | Legacy Settlement V2 | Admin Next Synthetic | Classification |
|---|---|---|---|
| Purpose | Operational driver↔company settlement on Firestore | Phase 2 synthetic workflow + ledger journal | Compatible (concept) |
| Status labels | draft / locked / partially_paid / settled / voided | draft / under_review / rejected / approved / closed / reversed | **Conflict** (names) |
| Party | Driver primary; agent unclear | driver \| agent | **Adaptable** / agent **Missing Legacy** clarity |
| Amounts source | V2 accounting lines from orders | SyntheticFinancialPolicy + eligibility service | **Conflict** (policy) |
| Idempotency | Proven CF keys | idempotencyKey on synthetic entity | Compatible |
| Dual control | enforceChecker / void rules | approve ≠ create permissions | Adaptable |
| Payments subdocs | First-class settlement payments | Timeline events; less payment-native | **Missing Admin Next** depth |
| Opening balance | finance_controls createOpeningBalance | Not modeled on Settlement type | **Missing Admin Next** |
| Classic GL | NOT a CoA GL | Synthetic ChartOfAccounts exists but productionApproved=false | Compatible (both non-prod GL claims) |
| Production data | Live Firestore (Legacy only) | In-memory/synthetic repos | — |
| Period lock | finance_periods | periodFrom/To fields only | **Missing Admin Next** period service |
| Direction enum | DRIVER_PAYS_COMPANY / COMPANY_PAYS_DRIVER | Implied by party + summary | **Adaptable** |
| Eligibility | analyzeOrder eligible flag | SettlementEligibilityService | Adaptable |
| Unknowns | Agent inclusion; live edge cases | Production mapping | **Unknown** |

## Verdict

Treat as **Adaptable with Conflicts** — requires explicit adapter design in a later phase. **Do not** implement Production adapter in 3.5.

# FINANCIAL_POLICY_DECISION_REGISTRY

Statuses: `proven_legacy_behavior` | `canonical_read_rule` | `proposed_future_policy` | `human_approval_required` | `approved`

**Never conflate Legacy behavior with Future business policy.**

| ID | Topic | Status | Notes |
|---|---|---|---|
| FP-01 | Platform commission **amount** historical | `canonical_read_rule` | = persisted `total_app` when present+valid |
| FP-02 | Platform commission **rate** historical | `canonical_read_rule` | null unless snapshotted; **not** CF 15 |
| FP-03 | Platform commission **rate** future Production | **`approved` (FC-01)** | Official rate **15%** via versioned `PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT`; missing binding still fail closed `FINANCE_POLICY_UNRESOLVED_FC01`; historical amounts not re-rated |
| FP-04 | CF hardcoded 15% of base | `proven_legacy_behavior` → **promoted** into FC-01 approved versioned config | Evidence only as literal; rate for new calcs must resolve from policy, not CF hardcode |
| FP-05 | Driver net historical | `canonical_read_rule` | `total_mndob` primary; derived with provenance only |
| FP-06 | Discount vs driver net | **`approved` (F6 FC-02)** | Preserve gross; discount separate; funding owner required; missing ≠ 0; persisted net for settlement |
| FP-07 | Agent attribution historical | `canonical_read_rule` | Snapshot or `unknown_historical`; never current country agent |
| FP-08 | Agent settlement inclusion | **`approved` (F6 FC-03)** | One-active-agent; cash≠card; separate exposures; Production write GO still separate |
| FP-09 | VAT amount historical | `canonical_read_rule` | Read `total_vat`; no current-country recompute |
| FP-10 | VAT rate / inclusive UX future | `proposed_future_policy` + `human_approval_required` | VatPolicy draft productionApproved=false |
| FP-11 | Chargeback lifecycle | `canonical_read_rule` + **F6 FC-04 accounting APPROVED** | Historical not_represented on trip; chargeback = append-only adjustment; disputed→suspense |
| FP-12 | Chargeback future gateway | superseded in part by FC-04 | Gateway adapter still not live; accounting rules locked |
| FP-13 | Incomplete ≠ zero | `canonical_read_rule` + enforced in tests | availabilityStatus required |
| FP-14 | Synthetic Admin Next rates | `proven_legacy_behavior` N/A — synthetic | Separate from Canonical historical; productionApproved=false |
| FP-15 | Production may use only approved policies | `canonical_read_rule` | status=approved AND productionApproved=true |
| FP-16 | Gateway fee | **`approved` (F6 FC-05)** | Independent component; default owner Company; never silent deduct driver/agent |

## FinancialPolicy versioning (code)

- Model: `src/domain/canonical/FinancialPolicy.ts`
- F6 locked policies: `src/domain/finance/v2/policies/` (FC-01..FC-05)
- Future VAT: `VatPolicy.ts` (draft)
- Chargeback Phase 3.6 shell: `ChargebackPolicy.ts` (superseded for accounting by F6 FC-04)
- Discount Phase 3.6 unresolved constant retained for historical tests; F6 APPROVED in `DiscountTreatmentPolicyF6.ts`
- Provider rates for synthetic calc only via `SyntheticFinancialPolicyProvider` — never hardcoded 0.15/15 in `FinancialCalculationService`

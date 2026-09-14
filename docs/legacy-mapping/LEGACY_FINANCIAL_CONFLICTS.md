# Legacy Financial Conflicts

| ID | Conflict | Sides | Impact | Confidence |
|---|---|---|---|---|
| FC-01 | Platform fee rate source | CF/payment-api **hardcode 15%** of base vs `app_commission_percent` fields on user/country | Production Read cannot assume country field drives trip majors | high |
| FC-02 | Driver net base | CF: `base - app - vat` vs V2 derive-from-`total` when ksm=0 | Discounted trips: customer total ≠ base; net formula choice changes | high |
| FC-03 | Misleading V1 names | `repCommission`/`deliveryFees` vs real DriverNet/Gross | Wrong Admin Next mapping if copied blindly | high |
| FC-04 | Paid vs completed | V1 revenue uses **paid**; V2 buckets separate completed∧collected | KPI mismatch across Admin screens | high |
| FC-05 | Agent attribution | Country-scope historical vs per-order snapshot new | Agent due reports incomplete for old trips | medium |
| FC-06 | Wallet balance field | `currentBalance` vs `walletBalance` both written | Read ambiguity | medium |
| FC-07 | Chargeback | UI sums `chargeback` / payment_status; no N-Genius chargeback handler proven | Cannot model chargebacks | low / NOT FOUND flow |
| FC-08 | Dual status_code / halh_text | Machine vs Arabic dual-write | Finance lifecycle may fall back to Arabic if status_code empty | medium |
| FC-09 | Multiple finance engines | V1 FinancialEngine, V2 AccountingEngine, V3 snapshot | Same trip different numbers by screen | high |

## Production Read implication

Until FC-01, FC-02, FC-05, FC-07 reconciled with a documented policy, **Production Read for finance is blocked**.

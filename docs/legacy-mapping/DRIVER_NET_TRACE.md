# DRIVER_NET_TRACE

## Observed write formula (CF) — HIGH

`total_mndob = (baseFareHalalas − appFeeHalalas − vatHalalas) / 100`

Evidence: `bookingFinancialMajorsFromQuote` in `ngenius_payments.js`.
Unit test: majors50 → 42.5 from 50 / 7.5 / 0.

**Discount does not reduce driver net** in this write path (`total` can be lower than base).

## Comparison matrix

| Surface | How driver net obtained | Matches CF write? | Confidence |
|---|---|---|---|
| Customer CF create | Persists `total_mndob` | Source | high |
| payment-api `build-order` | `driverNetMinor = max(0, base − app − vat)` | Yes | high |
| Legacy Admin V1 `FinancialEngine` | Reads `totalMndob` as `repCommission` (misleading name) | Amount yes; name conflict FC-03 | high |
| Legacy Admin V2 `financial_accounting_v2.analyzeOrder` | Prefer stored; else DERIVED_FROM_TOTAL (ksm=0) or DERIVED_FROM_GROSS_BASE | Prefer stored ≈ CF; derive-from-total conflicts when discount | high |
| Settlement V2 | Uses accounting line `driverNetMinor` | Depends on analyzeOrder | high |
| Driver App (mndob) | Displays/uses order fields / wallet; no alternate net writer found in re-trace | Likely reads stored | medium |
| Reports / F1↔V2 parity helpers | Compare minors with tolerance | Detect mismatches | medium |

## Conflicts → Financial Conflict

| ID | Conflict | Impact |
|---|---|---|
| FC-02 | CF/stored: base−app−vat vs V2 derive `total−app−vat` when ksm=0 path mis-applied / discount cases | Wrong entitlement |
| FC-03 | V1 `repCommission` name | Mapping hazard |
| FC-09 | Multi-engine screens | Same trip different confidence |

## Classification

| When | Class |
|---|---|
| `total_mndob` present & matches gross formula ±1 minor | **A** |
| Derived by V2 with notes | **B** (mark derived) |
| Stored vs formula mismatch | **C** |
| Missing | **D** → null, not 0 |

## Conclusion

**Authoritative trip driver net for Production Read candidate = persisted `order.total_mndob`.**  
Derived paths are secondary and must carry warnings. Do not treat Observed formula as future policy without finance sign-off.

## Phase 3.6 Canonical freeze

- Primary historical source: persisted `total_mndob`.
- Missing → optional derived with provenance (`formulaId`, `derivedFrom`); derived **not** settlement-eligible without explicit policy.
- `DiscountTreatmentPolicy` status=unresolved, `productionApproved=false` — discount NOT auto-treated as driver-net reduction.
- FC-02 CLOSED for SAFE READ display; remains Future Policy / settlement blocker.

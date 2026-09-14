# Legacy Mapping Summary (Q1–Q17)

## Q1. Where is Legacy?
`/Users/ventura/ara-ban` — single git root. Subprojects under `admin/`.

## Q2. What applications exist?
Admin (`admin_arawatan`), Customer (`ara_oatan_app`), Driver (`mndob`), payment-api, touri-website, ops scripts.

## Q3. Trip data source?
Firestore `order` collection. Confidence: **high**.

## Q4. Trip status model?
`status_code` canonical + `halh_text`/`halh_order` dual-write. See TRIP_STATUS_MAPPING.md.

## Q5. Driver data source?
Firestore `user` where `ismndob` / driver flags. Confidence: **high**.

## Q6. Driver status model?
Five orthogonal axes (registration ≠ account ≠ online ≠ availability ≠ on-trip). See DRIVER_STATUS_MAPPING.md.

## Q7. Customer mapping?
`user` docs without driver/agent admin flags; linked from `order.USER`.

## Q8. Agent mapping?
`user` with `Isagent=true`; country via `Rev_dloh_agent`; lock `agent_country_assignment`.

## Q9. One agent per country?
**Backend-enforced** for active assignment (F3-C3). Historical multi-agent possible for attribution.

## Q10. Geography?
`countries` / `cities` / `villages` / `mkan` (+ aliases `city_sa_*`). City scoping mismatch risk documented.

## Q11. Financial fields?
See FINANCIAL_FIELDS_EVIDENCE.md — majors on `order`; settlements in `financial_*`.

## Q12. Financial formulas?
CF quote (15% platform, VAT on base); driver net = base − app − vat. See LEGACY_FINANCIAL_FORMULAS.md.

## Q13. Conflicts?
Hardcoded 15% vs country fields; V1/V2/V3 engines; paid vs completed; agent snapshot gaps. See LEGACY_FINANCIAL_CONFLICTS.md.

## Q14. Auth/RBAC?
Firebase Auth + custom claims from `isAdminRule` / flags. See LEGACY_AUTH_RBAC.md.

## Q15. Cloud Functions?
Large Admin finance surface + Customer payments/wallet + Driver push. See CLOUD_FUNCTIONS_INVENTORY.md.

## Q16. Production Read readiness?
**Score 41/100** — see PHASE_3_REPORT §47. Finance conflicts + auth blockers dominate.

## Q17. Safe to design Phase 4 controlled Production Read?
**NO-GO** until blockers in AUTH_PRODUCTION_BLOCKERS + financial FC-01/02/05/07 have explicit read policies (still no adapters in Phase 3).

## Reconciliation requirements (future read-only — do not run now)

1. Sample N completed cash + online orders: recompute majors vs stored
2. Compare country.vat / isvat vs written total_vat
3. Detect app_commission_percent ≠ 15 on countries with recent orders
4. Count orders missing status_code / financial majors / agent snapshot
5. Count countries with >1 currently-active Isagent
6. Wallet docs with currentBalance ≠ walletBalance
7. Settlement lines vs order ids integrity
8. Ruleset hash compare across three firestore.rules copies

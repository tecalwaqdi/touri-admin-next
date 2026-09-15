# Admin Next PC-5 Closure — Finance Terminology & Reporting UX

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-5 Finance Terminology & Reporting UX (PRESENTATION / READ ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1..4 PASS (`5c0bbadc039a19e201df7650346a480fb1419667`)  
**Commit message:** `feat: improve finance terminology and reporting UX`

## Goal

Make Finance / Settlements / Reports understandable to operators (AR/EN) without changing FR1–FR7 accounting, aggregation, sources, writes, WIF/Auth/RBAC, or Production data.

## Terminology map (central)

**Module:** `src/domain/presentation/financeTerminology.ts`

Internal keys remain domain/storage names. UI labels map via `presentFinanceTerm` / related helpers.

| Internal key | EN | AR |
|---|---|---|
| grossBookingValue | Gross Booking Value | إجمالي قيمة الحجوزات |
| eligibleRevenue | Eligible Revenue | الإيراد المؤهل للاحتساب |
| platformCommission | Company Commission | عمولة الشركة |
| companyCommission | Company Commission | عمولة الشركة |
| companyAllocation | Company Allocation | حصة الشركة |
| vatTax | VAT / Tax | ضريبة القيمة المضافة |
| gatewayFees | Payment Gateway Fees | رسوم بوابة الدفع |
| refunds | Refunds | المبالغ المستردة |
| chargebacks | Chargebacks | عمليات الاسترداد القسري |
| adjustmentsMonetary | Monetary Adjustments | تسويات مالية |
| paidConfirmed | Confirmed Paid Amount | المبلغ المسدد والمؤكد |
| outstanding | Outstanding Balance | الرصيد المستحق |
| collectedCash | Cash Collected | التحصيل النقدي |
| driverNet | Driver Net Amount | صافي مستحق السائق |
| amountMinor | Amount (minor units) | المبلغ (وحدات صغرى) |
| incompleteReasons | Incomplete Reasons | أسباب عدم الاكتمال |

**Semantic note:** `platformCommission` is Legacy `total_app` (company take). Labeled **Company Commission**, not gateway fee / VAT.

Tooltips (`tipEn` / `tipAr`) cover eligible revenue, confirmed paid, outstanding, gateway fee, adjustment, chargeback.

## Finance screen changes

### Dashboard (`FinancePage`)
- Grouped KPIs: Business Volume / Company Revenue / Driver Position / Settlements / Corrections
- Driver Position metrics marked **not represented** (not on company FR7 dashboard) — no invented client calc
- Country view when country filter set (`/api/finance/countries/[id]`)
- Agent view when country + agentId set (`/api/finance/agents/[id]`)
- Corrections table: kind/status/amount/monetary effect; neutral memo copy
- Filters: country (canonical), currency, agentId (bounded; requires country)
- SourceLabelBadge + pilot notice when `production_pilot`
- Distinct empty / unavailable / incomplete / forbidden states
- `dir=rtl|ltr` on finance content

### Settlements list
- Business columns: ID, Party, Country, Currency, Direction, Settlement Amount, Confirmed Paid, Outstanding, Status
- Direction AR/EN mapped; status via StatusBadge (`locked` → Approved presentation)
- Direction + status filters (canonical IDs)
- No mutation beyond existing New link gated by `settlements:create` (writes still disabled)

### Settlement detail
- Sections: Overview, Party/Scope, Amounts, Payment progress, Source linkage, Related corrections
- **No mutation buttons**
- Direction/status/money via shared presentation helpers

### Reports
- Display model: business metric labels + formatted amounts (no raw `amountMinor` column header in UI)
- Report type titles localized for existing FR7 types only
- CSV export: headers localized at API presentation boundary (`locale=ar|en`); row values remain machine-safe minors + currency

## Status / direction

| Domain value | EN presentation | AR presentation |
|---|---|---|
| locked | Approved | معتمد |
| draft | Draft | مسودة |
| partially_paid | Partially paid | مدفوع جزئيًا |
| settled | Settled | مُسوّى |
| voided | Voided | ملغى |
| DRIVER_PAYS_COMPANY | Driver Pays Company | السائق مدين للشركة |
| COMPANY_PAYS_DRIVER | Company Pays Driver | الشركة تدفع للسائق |
| AGENT_PAYS_COMPANY | Agent Pays Company | الوكيل مدين للشركة |
| COMPANY_PAYS_AGENT | Company Pays Agent | الشركة تدفع للوكيل |

`locked` → Approved confirmed by FR4 / `FINANCE_IMPLEMENTATION_DESIGN.md` (`draft → locked` = approval). Stored enum unchanged.

## Money-state semantics

Shared via `formatReportMoney` + `presentMoneyAvailability`:

| availability | EN | AR |
|---|---|---|
| missing / incomplete | Incomplete | بيانات غير مكتملة |
| unknown | Unknown | غير معروف |
| not_represented | Not applicable | غير منطبق |
| policy_blocked | Unavailable | غير متاح |

Never render `0 SAR` for missing/unknown/unavailable. Minor→major only through `formatMinorUnitsDisplay`. No FX / no cross-currency sum in UI.

## Fields deliberately left unavailable

| Field / view | Reason |
|---|---|
| Driver gross/deductions/net on company dashboard | Not in `CompanyFinanceMetrics` — shown as not_represented |
| Driver finance dedicated page | No `/api/finance/drivers` route; use report type `driver_finance` |
| Prepared By / Approved By / Updated At on list | Not on `SettlementListItem` FR7 contract |
| Client-side commission / VAT / settlement recompute | Forbidden — FR7 authoritative |

## Proof: no calculation changes

- `FinanceReportingAggregator.ts` / `FinanceReportingReadService.exportSource` / FR1–FR6 modules **untouched** for accounting logic
- CSV localization only at `src/app/api/finance/export/route.ts` after `exportSource` (headers mapped; values unchanged)
- UI uses `MoneyCell` / `formatMinorUnitsDisplay` only — no `FinancialCalculationService`, no commission math
- Tests assert FR7 service still emits raw internal headers (`metric`, `amountMinor`)

## Non-regression

- AUTH verified_token path unchanged
- WIF-native FR7 reads unchanged
- ADC active credential paths = 0 for finance RO port
- Production synthetic fallback forbidden
- Write flags remain false; settlement detail has no approve/execute buttons
- One-country-one-active-agent unchanged
- PC-1..4 surfaces preserved

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1540 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Remaining for PC-6+

| Phase | Work |
|---|---|
| **PC-6** | Cities/landmarks UI; deeper geo DQ |
| PC-7 | Full app i18n/RTL (beyond finance) |
| PC-8 | Visual/responsive polish |
| PC-9 | Controlled writes (only when deliberately enabled) |
| PC-10 | Commercial cutover / pilot exclusion defaults |

### Known PC-5 limitations (honest)

1. Driver Position on company dashboard is intentionally unavailable (use Driver Finance report).
2. Prepared/Approved actor columns not shown — not on FR7 settlement list contract.
3. Full-app localization remains PC-7; only finance/report surfaces were localized here.

## Deploy

**NO** — PC-5 does not deploy and does not enable write flags.

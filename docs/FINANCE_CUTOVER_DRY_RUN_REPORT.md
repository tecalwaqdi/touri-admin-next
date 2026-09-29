# Finance Clean Cutover — DRY RUN REPORT
Generated: 2026-09-28
Mode: READ-ONLY (productionWrites=0, deletions=0)
Status: STOPPED — awaiting explicit approval

## Cutover config
- Env key: `FINANCE_CUTOVER_DATE`
- Approval key: `FINANCE_CUTOVER_APPROVED` (must be unset/false until apply)
- Proposed default (NOT approved): `2026-10-01T00:00:00.000Z`
- UI must not hardcode this date; use `resolveFinanceCutoverDate()`

## Live Production sample (bounded FR7 window + Finance UI)
Source: https://touri-admin-next.vercel.app/finance (+ exceptions + explorer)
Note: FR7 RO hard-caps 50 docs/collection — NOT a full census.

### Finance Home / Exceptions counters
| Signal | Count |
|--------|------:|
| Certified KPIs (selected period) | empty / — |
| Reconciliation differences | 1 |
| Finance exceptions needing review | 3 |
| Historical settlements needing review | 3 |
| Legacy orphan settlements (read-only) | 3 |
| Historical incomplete | — (not represented) |
| Financial conflicts | — (not represented) |
| Unsettled certified commercial snapshots | 0 |

### Legacy orphan settlement IDs (explorer / historical)
- `fin_set_mu82wtpd_hwfkm27n`
- `fin_set_mu82pokm_yq15f4ms`
- `fin_set_mu82nocu_bc037l01`

Classification: **LEGACY_ORPHAN** — archive/read-only; never delete; never force-map to certified snapshots.

### Additional settlement id observed in explorer DOM (needs classification on apply pass)
- `iOYduoa6IXPdkUUdhHLq` — present in operational filter scrape; treat as **unclassified pending full RO load** (do not delete).

## Provenance-proven synthetic IDs (fixture registry / pilot constants)
SAFE TO DELETE only after second explicit approval AND existence verify + child link report:
- `test_adminnext_finance_fr1_completed_001` (order/snapshot fixture)
- `test_adminnext_finance_fr2_settlement_v2_001`
- `test_adminnext_finance_fr5_settlement_payment_001`
- `test_adminnext_finance_fr6_adjustment_001`

Heuristic ID matches without registry provenance = **NOT safe to delete**.

## Opening balances (dry-run)
No supported opening balances proposed from live sample:
- No unpaid **REAL_CERTIFIED** settlements with complete amount+paid+direction in the observed window
- Orphans / incomplete / conflict must NOT convert to opening balances
- Driver opening balances: []
- Agent opening balances: []
- Company opening: receivable=0 payable=0 (sample)

## Tooling added (not applied)
- `src/domain/finance/cutover/FinanceCutoverConfig.ts`
- `src/domain/finance/cutover/FinanceCutoverClassification.ts`
- `src/domain/finance/cutover/FinanceOpeningBalanceProposal.ts`
- `src/application/finance/cutover/FinanceCutoverInventoryDryRun.ts`
- `POST /api/finance/cutover/inventory-dry-run` (read-only)
- `scripts/finance-cutover-inventory-dry-run.mts`
- Unit tests: `src/test/unit/finance-cutover-inventory-dry-run.test.ts` PASS

## Archive plan (not executed)
1. Mark all pre-cutover REAL_* + LEGACY_ORPHAN as archive/read-only
2. Accountant nav: الأرشيف المالي السابق — search/filter/view/export only
3. Block prepare/approve/execute/reconcile/modify on archived records
4. Exclude archive from Finance Home KPIs, new settlements, cash, recon, outstanding
5. Labels: تسوية تاريخية غير مرتبطة / بيانات مالية تاريخية غير مكتملة / تعارض مالي تاريخي

## New period plan (not executed)
1. From cutover onward: completed+final → majors → certified snapshot → Settlement V2 → payment → recon
2. Finance Home default NEW PERIOD ONLY
3. Surface الرصيد الافتتاحي / حركة الفترة / الرصيد الحالي separately
4. Only post-cutover certified data in official KPIs

## Safety checklist
- REAL RECORDS TO DELETE: **0**
- Destructive writes: **none**
- Money values: **unchanged**
- Audit/payment history: **preserved**

# Finance Cutover Pre-Apply — Status

**Date:** 2026-09-28  
**Mode:** PRE-APPLY ONLY — no deletes, no opening-balance posts, `FINANCE_WRITE_ENABLED=false`

## Cutover boundary (wired)

| Field | Value |
|-------|-------|
| Business date | `2026-10-01` |
| Timezone | `Asia/Riyadh` |
| UTC instant | `2026-09-30T21:00:00.000Z` |
| Approved | **false** (`FINANCE_CUTOVER_APPROVED` unset) |

Verified live on `/finance/archive` banner.

## Deployed wiring

- `POST /api/finance/cutover/inventory-dry-run` — paginated census (`queryPage`, max 200 pages × 50)
- `GET /api/finance/archive` — read-only archive API
- `/finance/archive` — الأرشيف المالي السابق (search/filter/view/export)
- Finance Home period split: الرصيد الافتتاحي / حركة الفترة / الرصيد الحالي
- Opening-balance **schema** + validation + idempotency keys — **persist disabled**
- QA delete **manifest builder** — deletions = 0
- Cutover default clamps Finance Home `from` to cutover business date

## Production census execution

**Blocked in this agent session:** operator auth unavailable (`FINAL_LIVE_*` unset, non-TTY, keychain path not usable).  
Deployed API is ready; run:

```bash
FINANCE_WRITE_ENABLED=false \
ADMIN_NEXT_BASE_URL=https://touri-admin-next.vercel.app \
node scripts/run-finance-cutover-pre-apply-dry-run.mjs
```

(with keychain or `FINAL_LIVE_EMAIL`/`FINAL_LIVE_PASSWORD` / `FINAL_LIVE_ID_TOKEN`)

## Live UI sample (prior + archive)

- Legacy orphans (3): `fin_set_mu82wtpd_hwfkm27n`, `fin_set_mu82pokm_yq15f4ms`, `fin_set_mu82nocu_bc037l01`
- Archive page returns multiple pre-cutover rows (12 detail links observed for SA)
- Recon differences: 1 (home/exceptions)
- Opening balances posted: **0** (by design)

## Safety

- REAL RECORDS TO DELETE: **0**
- FINANCE_WRITE_ENABLED: **false**
- READY FOR CUTOVER APPLY: **NO**

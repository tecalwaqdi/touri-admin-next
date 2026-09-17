# Admin Next — Legacy Emergency Fallback Runbook

**Legacy URL (retain):** https://tutorial-multi-language-70gx4j.web.app/admin/  
**Admin Next URL:** https://touri-admin-next.vercel.app  
**Planned custom domain:** https://admin-next.touri-taxi.com  
**Firebase:** `tutorial-multi-language-70gx4j`

## Purpose

Legacy Admin remains available as an **emergency-only** fallback. It must not be deleted.
Do **not** restore unsafe Legacy write paths that were intentionally closed.

## When to use Legacy

Use Legacy **only** if:

1. Admin Next Production is unavailable (outage), **or**
2. A specific operational task is blocked on Admin Next with no safe workaround, **and**
3. The task is time-critical for business continuity.

## Before using Legacy

1. Confirm Admin Next write gates are **all false** (or Admin Next is down).
2. Prefer Admin Next **read** paths when they still work.
3. Record the reason, operator, timestamp, and ticket/incident id.

## After Legacy emergency use

1. Return operators to Admin Next as soon as it is healthy.
2. Reconcile any Legacy-side changes against Admin Next source-of-truth.
3. Do not leave Legacy as the default daily workspace.

## Forbidden

- Deleting or unpublishing the Legacy Admin URL
- Re-enabling closed/unsafe Legacy mutation surfaces “because it is easier”
- Using Legacy for routine Driver/Agent/Customer/Finance work once Admin Next domain writes are PASS

## Related

- `docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md` — kill switches, pilots, WIF
- Legacy remains at: https://tutorial-multi-language-70gx4j.web.app/admin/

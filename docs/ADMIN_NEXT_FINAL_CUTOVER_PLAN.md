# Admin Next — Final Cutover Plan

**Status:** PLAN ONLY — do **not** execute cutover in this phase.
**Target URL (pre-DNS):** https://touri-admin-next.vercel.app
**Canonical DNS (later):** https://admin-next.touri-taxi.com
**Invariant:** all Production write gates remain FALSE until staged pilots succeed.

---

## Sequence (mandatory order)

### 1. Code validation

```bash
cd /Users/ventura/touri-admin-next
npm test && npm run typecheck && npm run build && git diff --check
```

Confirm PC1–PC10, FR1–FR7, P0, P1, P2 parity tests green.
Confirm `docs/ADMIN_NEXT_LEGACY_GAP_MATRIX.md` shows P0/P1 gaps ZERO.

### 2. Production deploy with all writes OFF

- Deploy Official Vercel project `touri-admin-next` only
- Env: `PRODUCTION_READ_MODE=shadow` (or armed RO as already validated)
- All `*_WRITE_ENABLED=false`, `GLOBAL_PRODUCTION_WRITE_ENABLED=false`
- No DNS change in this step
- No Firebase Authorized Domains change yet

### 3. Authenticated 33/33 read regression

- Run `scripts/final-live-validation.mjs` (or current live harness)
- Super Admin + scoped country admin samples
- Expect RO success; any write attempt → 403 WRITE_DISABLED
- Sanitize output to `.local/` — never paste tokens

### 4. P2 module smoke

Manual smoke on Production URL (writes OFF):

- Dashboard KPIs honest unavailable/bounded
- Trips/Drivers/Customers/Agents filters + pagination
- Geography hierarchy tabs (countries/regions/cities/landmarks) + DQ
- Vehicle catalog / Partners / Fleet / Guides
- Support filters + detail links
- Notifications unread filter
- Finance FR7 / Settlements / Reports CSV + print
- Users / Roles / Audit
- Driver document preview returns Fake offline URL (no Production Storage arm)

### 5. Safe write fixtures

- Provision synthetic fixtures only (never real customer money)
- Confirm Fake repositories + offline pilots still green locally
- Prepare idempotency keys + audit correlation IDs

### 6. Staged write pilots (one domain at a time)

Order:

1. Geography soft activate/deactivate (non-CP5)
2. Vehicle catalog deactivate
3. Drivers review transitions (approve/reject/needs_changes on fixture)
4. Support status/assign
5. Notification mark-read
6. Partners / Fleet / Guides narrow fields
7. Customers disable/block on fixture
8. Agents activate/deactivate (ONE-COUNTRY-ONE-AGENT)

Each pilot: dry-run → single apply → audit INTENT/RESULT → rollback path ready.

### 7. Identity WIF IAM

- Execute `docs/ADMIN_NEXT_IDENTITY_WIF_IAM_RUNBOOK.md` (operator)
- Negative: shadow-reader cannot write
- Synthetic identity persona pilot only after IAM proof

### 8. Finance pilot last

- FR2/FR4/FR5 settlement + payment pilots on synthetic settlements only
- SoD actors distinct
- Never arm finance before ops pilots green

### 9. All-write validation

- Domain-by-domain Production gates still individually controllable
- Full matrix check: expected writes only; unexpected collections untouched
- Observe dashboards / audit for 24–72h

### 10. Custom DNS

- Squarespace: `admin-next` A → Vercel (`docs/HOSTING.md`)
- Do not touch `@` / `www` / MX
- Verify TLS on `https://admin-next.touri-taxi.com`

### 11. Firebase Authorized Domain

- Add `admin-next.touri-taxi.com` to Firebase Auth authorized domains
- Confirm login on custom host

### 12. Observation window

- Parallel run: Legacy Admin available as rollback
- Watch: WIF errors, 403 storms, finance missing≠0 honesty, IDOR

### 13. Legacy Admin retirement decision

Retire Legacy **only when**:

- EFFECTIVE BUSINESS REPLACEMENT = operator YES for current tasks
- All required write domains piloted
- Identity IAM proven
- Finance pilots proven
- Observation window clean
- Rollback owner named

If any Production write still depends on Legacy → **keep Legacy RO/ops** until closed.

---

## Explicit non-goals for this document’s phase

- No deploy execution from P2 session
- No write-gate arming
- No Production mutation
- No DNS change
- No IAM grant execution

See also: `docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md`, `docs/ADMIN_NEXT_PC10_CUTOVER.md`, `docs/ROLLBACK.md`.

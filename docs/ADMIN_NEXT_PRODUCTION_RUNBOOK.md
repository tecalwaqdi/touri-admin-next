# Admin Next — Production Runbook

**Project:** `touri-admin-next` (Vercel)
**Default URL:** https://touri-admin-next.vercel.app
**Custom URL:** https://admin-next.touri-taxi.com
**Legacy RO fallback:** https://tutorial-multi-language-70gx4j.web.app/admin/
**Firebase project:** `tutorial-multi-language-70gx4j`
**Cutover mode:** SAFE PARTIAL / pilot framework ready
PILOT EXECUTED: NO
WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL: YES
MASTER RUNNER: `scripts/finish-admin-next-production.mjs`
DRIVER PILOT: `scripts/run-driver-production-pilot.mjs`
NEGATIVE PROBE: `PILOT_NEGATIVE_PROBE_ONLY=1`
OPERATOR ARTIFACTS: `.local/write-pilots/` (driver-pass / agent-fixture — not runbook SoT)

This runbook contains **no secrets**. Platform secrets live only in Vercel Project → Settings → Environment Variables → Production.

---

## 1. Kill switches (immediate)

Set **all** of the following to `false` on Vercel Production, then redeploy or wait for env reload:

```text
GLOBAL_PRODUCTION_WRITE_ENABLED=false
PRODUCTION_WRITE_ENABLED=false
DRIVER_WRITE_ENABLED=false
AGENT_WRITE_ENABLED=false
CUSTOMER_WRITE_ENABLED=false
CUSTOMER_AUTH_WRITE_ENABLED=false
GEOGRAPHY_WRITE_ENABLED=false
ADMIN_IDENTITY_WRITE_ENABLED=false
FINANCE_WRITE_ENABLED=false
NEXT_PUBLIC_CONTROLLED_WRITES_UI=false
```

Optional blast-radius reduction (reads stay preferred unless emergency):

```text
PRODUCTION_READ_ENABLED=true
PRODUCTION_READ_MODE=shadow
FINANCE_REPORTING_SOURCE_MODE=production_read_only
AUTH_MODE=verified_token
```

Never set `GOOGLE_APPLICATION_CREDENTIALS`. Prefer WIF:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER=<WIF provider resource name>
GCP_SERVICE_ACCOUNT_EMAIL=touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com
```

---

## 2. Smoke endpoints (read-only)

### Pages (browser)

`/login`, `/dashboard`, `/trips`, `/drivers`, `/customers`, `/agents`, `/geography`, `/geography/cities`, `/geography/landmarks`, `/support`, `/notifications`, `/finance`, `/settlements`, `/reports`, `/users`, `/roles`, `/audit`
(`/settings` shows NOT_APPLICABLE notice only — not in nav)

Detail patterns: `/trips/[id]`, `/drivers/[id]`, `/customers/[id]`, `/agents/[id]`, geography + settlements + users + audit detail routes.

### APIs (do not log bearer tokens)

Unauthenticated GET should fail closed (`401`/`403`), not `500`:

- `GET /api/dashboard`
- `GET /api/trips` · `/api/drivers` · `/api/customers` · `/api/agents`
- `GET /api/geography/countries|cities|landmarks|data-quality`
- `GET /api/finance/dashboard` · settlements · corrections · reconciliation
- `GET /api/users` · `/api/roles` · `/api/audit` · `/api/auth/me`
- `GET /api/support` · `/api/notifications`

### Write-zero probes

```bash
curl -sS -X POST "$BASE/api/drivers/probe/approve"
# expect: {"error":"PRODUCTION_WRITE_DISABLED",...} HTTP 403
```

Repeat for `needs_changes` / `suspend` / agent activate / customer disable / settlements create. **Any 2xx mutation = ABORT.**

---

## 3. Deploy (official project only)

```bash
cd /Users/ventura/touri-admin-next
npx vercel link --yes --project touri-admin-next   # once
npm test && npm run typecheck && npm run build
npx vercel --prod --yes
```

Do **not** deploy to other Vercel projects. Do **not** force-push unless explicitly required.

Rollback hosting:

```bash
npx vercel ls touri-admin-next --prod
npx vercel rollback <prior-deployment-url-or-id> --yes
```

---

## 4. Custom domain attach

Exact Vercel DNS target (retrieved from Vercel — do not invent):

```text
A  admin-next.touri-taxi.com → 76.76.21.21
```

Squarespace: host `admin-next` only. **Do not** change `@`, `www`, or MX.

Firebase Auth Authorized Domains must include `admin-next.touri-taxi.com`.

---

## 5. Driver write pilot procedure (operator-approved only)

**PC-10 STOP:** package ready; **do not execute** until explicit operator approval after `READ_ONLY_PRODUCTION_GO`.

Recommended first mutation (lowest blast):

| Field | Value |
|---|---|
| Resource | driver only |
| Action | `needs_changes` |
| From → To | `pending_review` → `needs_changes` |
| Target | dedicated **synthetic** driver only |
| Rollback | legal transition only (`resubmit_to_pending_review`) |
| Forbidden | commercial drivers, finance, agent, customer, geography, users |

### Arming order (post-approval)

1. Confirm RO smoke green on default (+ custom if attached).
2. Snapshot before-state + audit baseline + deployment SHA.
3. Set `NEXT_PUBLIC_CONTROLLED_WRITES_UI=true` (chrome only).
4. Arm **only** `GLOBAL_PRODUCTION_WRITE_ENABLED`, `PRODUCTION_WRITE_ENABLED`, `DRIVER_WRITE_ENABLED`.
5. Single idempotent `POST /api/drivers/{id}/needs_changes` with `expectedCurrentState` + `idempotency-key`.
6. Verify audit INTENT+RESULT; confirm zero finance/trip/auth side effects.
7. Restore **all** write flags + UI chrome to `false`, or complete legal rollback.

### Disable write UI / driver writes immediately

```text
NEXT_PUBLIC_CONTROLLED_WRITES_UI=false
DRIVER_WRITE_ENABLED=false
PRODUCTION_WRITE_ENABLED=false
GLOBAL_PRODUCTION_WRITE_ENABLED=false
```

Code reference: `buildPc10DriverWritePilotPackage()`.

---

## 6. Legacy fallback

If Admin Next is unavailable or unsafe:

1. Direct operators to Legacy RO Admin: https://tutorial-multi-language-70gx4j.web.app/admin/
2. Confirm Legacy finance write flags remain read-only (`LEGACY_ADMIN_WRITE_MODE=read_only`).
3. Optionally `vercel rollback` Admin Next to last known-good RO deployment.
4. Do **not** re-enable Legacy finance writes as a shortcut.

---

## 7. WIF / IAM notes (RO)

- Runtime: Vercel OIDC → GCP WIF → `touri-admin-next-shadow-reader@…`
- Prefer `roles/datastore.viewer` (or equivalent least privilege)
- SA must **not** be Project Owner/Editor
- OIDC subject constrained to the Vercel project / environment
- Never commit SA JSON

---

## 8. Commercial KPI honesty

- Bounded ops samples (≤50) — never label as exact totals
- No prefix-only silent pilot exclusion
- Uncertain rows: keep + DQ/pilot notice
- No Production deletion for hygiene

---

## 9. Incident ABORT criteria

Abort cutover / freeze writes if any of:

- Login failure or Auth misconfiguration
- WIF/OIDC fail-open or credential fallback to SA JSON
- Widespread 5xx
- Finance synthetic source in Production
- Any successful Production mutation while flags should be false
- RBAC / IDOR regressions
- KPI honesty regression (totals vs sample; silent pilot drops)

---

## 10. Final completion (pre-DNS)

**Artifacts:**

- `docs/ADMIN_NEXT_FINAL_COMPLETION.md` — product closure summary
- `docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md` — staged write activation order
- `docs/ADMIN_NEXT_FINAL_LIVE_VALIDATION.md` — default-URL smoke matrix

**Account deletion:** End-user deletion is **not** an Admin Next write. Customer/driver flows use the public website delete-account page and Cloud Functions (`account_deletion.js`) — Admin remains read-only for deletion state.

**Users/roles writes:** gated by `ADMIN_IDENTITY_WRITE_ENABLED` (default false). Architecture: allowlisted Firestore `user` persona → CF `syncUserClaimsOnWrite`. See `docs/ADMIN_NEXT_IDENTITY_WRITE_SECURITY.md`. Dedicated identity-admin WIF SA required before arming — never grant shadow-reader Auth Admin.

**Customer deletion:** NOT_APPLICABLE_TO_ADMIN — compliant website + Cloud Functions path only.

**Settings:** NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT.

**Authenticated smoke harness:** `node scripts/final-live-validation.mjs` → `.local/final-live-validation.json`.

WRITE_PILOTS EXECUTED: NO
DNS TOUCHED: NO

**Optional live shadow (nine tokens):** append `users,audit` to `LIVE_SHADOW_ALLOWED_RESOURCES` when ops wants explicit directory/audit tokens documented; seven-token Production config remains valid.

*End of Production runbook.*

# Admin Next PC-10 Cutover — Production Read-Only GO + Staged Write Pilot Prep

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-10 Production Cutover / Staged Pilot  
**Date:** 2026-09-15  
**Baseline:** PC-1..9 PASS (`7c8b061`)  
**Commit message:** `chore: prepare production cutover and staged write pilot`  
**INITIAL CUTOVER MODE:** `READ_ONLY`  
PILOT EXECUTED: NO  
WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL: YES

## Safety posture (non-negotiable)

All Production write gates remain **FALSE** throughout PC-10:

```text
GLOBAL_PRODUCTION_WRITE_ENABLED=false
PRODUCTION_WRITE_ENABLED=false
DRIVER_WRITE_ENABLED=false
AGENT_WRITE_ENABLED=false
CUSTOMER_WRITE_ENABLED=false
CUSTOMER_AUTH_WRITE_ENABLED=false
GEOGRAPHY_WRITE_ENABLED=false
FINANCE_WRITE_ENABLED=false
NEXT_PUBLIC_CONTROLLED_WRITES_UI=false
```

| Flag | Required |
|---|---|
| `GLOBAL_PRODUCTION_WRITE_ENABLED` | false |
| `PRODUCTION_WRITE_ENABLED` | false |
| `DRIVER_WRITE_ENABLED` | false |
| `AGENT_WRITE_ENABLED` | false |
| `CUSTOMER_WRITE_ENABLED` | false |
| `CUSTOMER_AUTH_WRITE_ENABLED` | false |
| `GEOGRAPHY_WRITE_ENABLED` | false |
| `FINANCE_WRITE_ENABLED` | false |
| `NEXT_PUBLIC_CONTROLLED_WRITES_UI` | false |

- No SA private-key JSON / no `GOOGLE_APPLICATION_CREDENTIALS` in Vercel.
- No Production mutation tests.
- Legacy Admin remains `READ_ONLY_CONFIG_GATED` rollback.
- Finance / Agent / Customer / Geography / Users writes stay OFF.

---

## PC10-A — Final read-only preflight

| # | Check | Result |
|---|---|---|
| 1 | Repo clean; HEAD `7c8b061` or later PC-10-only; secret/config static audit | PASS (false-positive docs/tests only; no live keys) |
| 2 | Production env contract (names + present/missing + non-secret values) | PASS — see §Env |
| 3 | Commercial KPI policy (reliable evidence only; no prefix-only exclude; uncertain → keep + notice) | PASS — `CommercialKpiPolicy` |
| 4 | Production route matrix coverage | PASS — `Pc10RouteMatrix` |
| 5 | API live contract matrix (no bearer logging) | PASS prep — unauth probes expect 401/403 |
| 6 | Production write-zero proof | PASS — POST driver approve → `PRODUCTION_WRITE_DISABLED` |
| 7 | WIF/IAM (shadow-reader SA; datastore.viewer; no Owner/Editor; OIDC constrained) | PASS contract in code/docs; live IAM operator-confirm |
| 8 | Dashboard/DQ honesty | PASS — bounded sample + `pilotIncludedNotice` |
| 9 | Visual live smoke AR/EN responsive | See deploy re-smoke |
| 10 | CSP/console — no unused `api.js` load | PASS — no `api.js` in layout/CSP; scoped `script-src` |

### Production env contract (non-secret)

| Name | Status | Expected / observed |
|---|---|---|
| `APP_ENV` | present | `production` |
| `NEXT_PUBLIC_APP_ENV` | present | `production` |
| `AUTH_MODE` | present | `verified_token` |
| `EXPECTED_ENVIRONMENT` | present | `production` |
| `EXPECTED_PROJECT_ID` | present | `tutorial-multi-language-70gx4j` |
| `GOOGLE_CLOUD_PROJECT` | present | `tutorial-multi-language-70gx4j` |
| `PRODUCTION_READ_ENABLED` | present | `true` |
| `PRODUCTION_READ_MODE` | present | `shadow` |
| `LIVE_SHADOW_ALLOWED_RESOURCES` | present | `countries,cities,landmarks,trips,drivers,agents,customers` |
| `FINANCE_REPORTING_SOURCE_MODE` | present | `production_read_only` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | present | `tutorial-multi-language-70gx4j` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | present | `tutorial-multi-language-70gx4j.firebaseapp.com` |
| Firebase web client keys | present | public config only (values not printed) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | present (secret) | WIF provider path |
| `GCP_SERVICE_ACCOUNT_EMAIL` | present (secret) | expected shadow-reader SA |
| Write flags listed above | false or missing→default false | **all falseish** |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset | required unset |

Explicitly set on Vercel Production if missing (still **false**):  
`GEOGRAPHY_WRITE_ENABLED=false`, `NEXT_PUBLIC_CONTROLLED_WRITES_UI=false`.

---

## PC10-B — Deploy (official Vercel project only)

**Project:** `touri-admin-next` only (`prj_IvmTJ8uG67wDK88bT74qFBOox1CI`)  
**Default URL:** https://touri-admin-next.vercel.app  
**Do not touch** other Vercel projects (`touri-taxi`, `touri-ban*`, `web`, …).

### Exact safe deploy steps

```bash
cd /Users/ventura/touri-admin-next
# Confirm write flags false in Vercel Production (env ls / env pull — never commit pull file)
npx vercel env ls production
git status   # clean PC-10 commit
npm test && npm run typecheck && npm run build
npx vercel --prod --yes   # or: npm run deploy:prod
# Re-smoke default URL only after Ready
curl -sI https://touri-admin-next.vercel.app/login
curl -sS -X POST https://touri-admin-next.vercel.app/api/drivers/probe/approve
# Expect PRODUCTION_WRITE_DISABLED (403) — no bearer logging
```

**Abort if:** login broken, WIF fail-closed errors on authenticated reads, 5xx storm, finance synthetic, any mutation success, RBAC/IDOR regression, KPI honesty regression.

**Target cutover state after successful default-URL re-smoke:** `READ_ONLY_PRODUCTION_GO`

---

## PC10-C — Custom domain `admin-next.touri-taxi.com`

### Exact DNS target (from Vercel Domains UI / CLI — do not guess)

Vercel domain inspection for `admin-next.touri-taxi.com` returned:

```text
A  admin-next.touri-taxi.com  76.76.21.21
```

Squarespace DNS (host = `admin-next` only — **do not** touch `@` / `www` / MX):

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `admin-next` | `76.76.21.21` | default |

Optional: Vercel may also request a `_vercel` TXT verification value from the Domains UI — paste exactly what Vercel shows (never invent).

### Firebase Authorized Domains (operator)

Firebase Console → Authentication → Settings → Authorized domains — ensure:

- `touri-admin-next.vercel.app`
- `admin-next.touri-taxi.com`

### Verify after DNS propagates

1. TLS: `https://admin-next.touri-taxi.com/login`
2. Login + WIF-backed list reads
3. Route matrix smoke
4. Write probe still `PRODUCTION_WRITE_DISABLED`

**Status if DNS/Firebase not changed in this session:** `PARTIAL` — operator action required.  
**Legacy RO rollback URL remains:** https://tutorial-multi-language-70gx4j.web.app/admin/

---

## PC10-D — Driver-only staged write pilot package (STOP)

Package code: `src/application/controlled-writes/pilot/Pc10DriverWritePilotPackage.ts`

```text
WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL = YES
PILOT EXECUTED = NO
productionArmed = false
resource = driver
action = needs_changes
from = pending_review → to = needs_changes
rollback = legal resubmit_to_pending_review only
liveTargetId = PENDING_OPERATOR_SAFE_SYNTHETIC_ONLY
```

**Forbidden:** commercial drivers · auto-pick · Finance/Agent/Customer/Geography/Users writes · silent Firestore repair · Production deletion.

Operator must approve + select a verified safe synthetic target before any arming (outside PC-10).

---

## PC10-E / F — Remain RO / OFF

Finance SoD Production arm, Customer, Agent, Geography, Users/Roles claims writes: **OFF**.

## PC10-G — Legacy fallback

Legacy Admin: `READ_ONLY_CONFIG_GATED` via `financial_config/runtime` + client gate. Keep as emergency RO ops surface.

## PC10-H — Artifacts

- `docs/ADMIN_NEXT_PC10_CUTOVER.md` (this file)
- `docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md`

---

## Verification commands

```bash
npm test
npm run typecheck
npm run build
git diff --check
# plus PC1–PC9 / FR / auth / WIF / write-gate / security / nav / i18n / production env contract unit coverage
```

## Cutover status vocabulary

| Status | Meaning |
|---|---|
| `READ_ONLY_PRODUCTION_GO` | Default Vercel URL healthy; writes false; ready for ops RO |
| `CUSTOM_DOMAIN_PARTIAL` | DNS/Firebase authorized domain pending |
| `WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL` | Package complete; not armed; not executed |
| `ABORT` | Login/WIF/5xx/finance synthetic/mutation/RBAC/KPI failure |

*End of PC-10 cutover doc. No secrets. Pilot not executed.*

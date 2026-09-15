# Admin Next — Final Live Validation (pre-DNS)

**URL:** https://touri-admin-next.vercel.app  
**DNS:** unchanged in automation sessions  
**Auth:** Firebase verified token (`AUTH_MODE=verified_token`)  
**Write gates:** all Production write flags remain **FALSE** (do not arm)

## Unauthenticated probes (safe)

| Check | Expect |
|---|---|
| `GET /login` | 200 |
| `GET /api/users` | 401 `UNAUTHORIZED` |
| `POST /api/drivers/probe/approve` | 403 `PRODUCTION_WRITE_DISABLED` |

## Authenticated harness (operator — preferred)

Sign in with a normal Production admin email/password. The harness obtains a Firebase ID token **in memory only** (never printed, never written to the artifact, never committed).

### Option A — interactive (TTY)

```bash
cd /Users/ventura/touri-admin-next
# Uses NEXT_PUBLIC_FIREBASE_* from .env.production.local / .env.local / env
node scripts/final-live-validation.mjs
# Prompts: FINAL_LIVE_EMAIL, then FINAL_LIVE_PASSWORD (echo muted)
```

### Option B — ephemeral env (one shell session only)

```bash
cd /Users/ventura/touri-admin-next
export FINAL_LIVE_BASE_URL=https://touri-admin-next.vercel.app
export FINAL_LIVE_EMAIL='your-admin@example.com'
# Prefer a local shell export — do not paste into chat, docs, or git.
read -s FINAL_LIVE_PASSWORD; export FINAL_LIVE_PASSWORD; echo
node scripts/final-live-validation.mjs
unset FINAL_LIVE_EMAIL FINAL_LIVE_PASSWORD
```

### Option C — existing local ID token (optional fallback)

Only if you already have a token from a browser session **locally**:

```bash
# NEVER paste the token into chat or commit it.
export FINAL_LIVE_ID_TOKEN='…'   # local shell only
node scripts/final-live-validation.mjs
unset FINAL_LIVE_ID_TOKEN
```

### Firebase client config

Harness reads `NEXT_PUBLIC_FIREBASE_API_KEY` (+ project/auth domain) from process env or gitignored local files:

- `.env.production.local`
- `.env.local`
- `.env`

Do **not** put `FINAL_LIVE_EMAIL`, `FINAL_LIVE_PASSWORD`, or ID tokens in committed `.env*` examples, docs, git, logs, or `.local/final-live-validation.json`.

### Artifact (sanitized)

PASS/FAIL → `.local/final-live-validation.json` (`.local/` is gitignored).

Allowed fields only (status, routes, HTTP codes, source classification, checklist).  
**Never** includes bearer token, password, email, or Authorization headers.

### Coverage

- Lists: `/api/auth/me`, dashboard, trips, drivers, customers, agents, finance (+ settlements/corrections/reconciliation), geography (+ data-quality), users, roles, audit, support, notifications
- Detail samples from real list IDs (skipped safely when a list is empty)
- Geography: `GET /api/geography/landmarks?countryId=saudi_arabia` — Saudi landmarks from the unfiltered page remain visible under the canonical filter
- Intentional missing detail → 404
- Write-zero: `POST /api/drivers/probe/approve` → 403 `PRODUCTION_WRITE_DISABLED` · production mutations = 0

## Authenticated matrix (operator UI)

| Route | Permission | Expect |
|---|---|---|
| `/dashboard` | authenticated | Bounded sample honesty |
| `/trips`, `/drivers`, `/customers`, `/agents` | `*:read` | Production source label |
| `/geography` | geography read | Countries/cities/landmarks |
| `/support`, `/notifications` | customers/drivers read | RO lists |
| `/finance`, `/settlements`, `/reports` | finance | FR7 RO |
| `/users`, `/roles` | `users:manage` | Personas + roles matrix |
| `/audit` | `audit:read` | CW audit or empty list |
| `/settings` | n/a | NOT_APPLICABLE notice only |

## Write zero proof

After deploy, write probes must remain denied while flags false. Harness probes one mutation and requires `PRODUCTION_WRITE_DISABLED`.

## Optional env upgrade

```text
LIVE_SHADOW_ALLOWED_RESOURCES=countries,cities,landmarks,trips,drivers,agents,customers,users,audit,support,notifications
```

Nine-token (users,audit) and seven-token Phase 4B remain valid.

## Abort criteria

Login failure, WIF 503 storm, finance synthetic fallback, any mutation success, RBAC/IDOR regression, misleading KPIs.

## Closing the readiness blocker

1. Operator runs Option A or B once against https://touri-admin-next.vercel.app  
2. Confirm console: `AUTHENTICATED LIVE VALIDATION: PASS`  
3. Confirm `.local/final-live-validation.json` → `summary.authenticatedLiveValidation: "PASS"`  
4. Do **not** arm write gates · do **not** touch DNS

*End of live validation checklist.*

# Admin Next — Final Live Validation (pre-DNS)

**URL:** https://touri-admin-next.vercel.app
**DNS:** unchanged in automation sessions
**Auth:** Firebase verified token (`AUTH_MODE=verified_token`)

## Unauthenticated probes (safe)

| Check | Expect |
|---|---|
| `GET /login` | 200 |
| `GET /api/users` | 401 `UNAUTHORIZED` |
| `POST /api/drivers/probe/approve` | 403 `PRODUCTION_WRITE_DISABLED` |

## Authenticated harness (operator)

```bash
# After normal browser login, copy ID token locally only — never into chat/git.
FINAL_LIVE_BASE_URL=https://touri-admin-next.vercel.app \
FINAL_LIVE_ID_TOKEN="…" \
node scripts/final-live-validation.mjs
```

Sanitized PASS/FAIL → `.local/final-live-validation.json` (gitignored).
Never prints/persists bearer tokens.

Covers: `/api/auth/me`, dashboard, trips, drivers, customers, agents, finance, settlements, reports, geography, users, roles, audit, support, notifications (+ detail samples when ids available).

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

After deploy, write probes must remain denied while flags false.

## Optional env upgrade

```text
LIVE_SHADOW_ALLOWED_RESOURCES=countries,cities,landmarks,trips,drivers,agents,customers,users,audit,support,notifications
```

Nine-token (users,audit) and seven-token Phase 4B remain valid.

## Abort criteria

Login failure, WIF 503 storm, finance synthetic fallback, any mutation success, RBAC/IDOR regression, misleading KPIs.

*End of live validation checklist.*

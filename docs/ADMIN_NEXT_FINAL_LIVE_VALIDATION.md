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

## Authenticated matrix (operator)

Use a Production admin account with known scope. Record correlation id / timestamp; do not log bearer tokens.

| Route | Permission | Expect |
|---|---|---|
| `/dashboard` | authenticated | Bounded sample labels; FR7 section if `finance:read` |
| `/trips`, `/drivers`, `/customers`, `/agents` | `*:read` | Production source label; scoped rows |
| `/trips/[id]`, `/drivers/[id]`, … | `*:read` | Detail DTO; 404 outside scope |
| `/geography` | `geography:read` | Countries/cities/landmarks; AR filter → `saudi_arabia` |
| `/finance`, `/settlements`, `/reports` | `finance:read` | FR7 RO; no synthetic in Production |
| `/users`, `/roles` | `users:manage` | Panel personas from `user`; roles matrix read-only |
| `/audit` | `audit:read` | CW audit or **empty list** (not 503 when read armed) |

## Write zero proof

After deploy, repeat write probes — must remain denied:

- Driver approve/reject/needs_changes/suspend  
- Agent activate/deactivate  
- Customer block  
- Settlement POST mutations  

## Optional env upgrade

To document nine-token live shadow explicitly on Vercel Production:

```text
LIVE_SHADOW_ALLOWED_RESOURCES=countries,cities,landmarks,trips,drivers,agents,customers,users,audit
```

Seven-token config remains valid; users/audit reads work without resource gate on queries.

## Abort criteria

Login failure, WIF 503 storm on lists, finance synthetic fallback, any mutation success, RBAC/IDOR regression, misleading dashboard totals.

*End of live validation checklist.*

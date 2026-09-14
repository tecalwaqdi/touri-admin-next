# Deployment

Admin Next deploys independently from Legacy.

## Canonical hosting

**Vercel** — see [HOSTING.md](./HOSTING.md).

- Config: `vercel.json`
- Production URL: `https://admin-next.touri-taxi.com`
- Deploy (only after CUTOVER_RETRY_GO): `npm run deploy:prod`

Do **not** point Legacy Firebase Hosting at Admin Next.

## Environment

Platform Production secrets live in Vercel Project → Settings → Environment Variables.

Contract file (no secrets): `.env.production.example`

Required Production posture:

- `APP_ENV=production` / `NODE_ENV=production` / `EXPECTED_ENVIRONMENT=production`
- `EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j`
- `FINANCE_REPORTING_SOURCE_MODE=production_read_only`
- All write flags `false` (including `GLOBAL_PRODUCTION_WRITE_ENABLED`)

## Build (local verify)

```bash
npm run typecheck
npm test
npm run build
```

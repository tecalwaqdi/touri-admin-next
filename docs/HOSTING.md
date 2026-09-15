# Canonical hosting — Admin Next

## Platform

**Vercel** (Next.js App Router). Chosen because:

- This repo is Next.js 15 (`package.json`)
- Brand site `www.touri-taxi.com` already CNAMEs to Vercel DNS
- Docs target `https://admin-next.touri-taxi.com`

Do **not** host Admin Next on Legacy Firebase Hosting (`tutorial-multi-language-70gx4j.web.app`).

## Config in repo

- `vercel.json` — framework, build, security headers
- Platform env / secrets set in Vercel project settings (never commit real secrets)
- Example contract: `.env.production.example`

## Deploy command (official project only: `touri-admin-next`)

```bash
npx vercel link --yes --project touri-admin-next
npx vercel env pull .env.production.local   # optional local check; gitignored
npx vercel --prod --yes
```

After first link, prefer:

```bash
npm run deploy:prod
```

All Production write gates must remain `false` during cutover. See `docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md`.

## Production URL

- Default (Vercel): `https://touri-admin-next.vercel.app`
- Canonical custom: `https://admin-next.touri-taxi.com`
- Official Vercel project only: `touri-admin-next`

## Custom domain DNS (Squarespace NS for `touri-taxi.com`)

Exact target retrieved from Vercel Domains (do not invent). Squarespace host = `admin-next` only — **do not** touch `@` / `www` / MX:

| Type | Host | Value | Purpose |
|------|------|-------|---------|
| A | `admin-next` | `76.76.21.21` | App hostname (Vercel-recommended) |
| TXT | `_vercel` | (value from Vercel Domains UI, if required) | Domain verification |

Firebase Auth → Authorized domains must include `admin-next.touri-taxi.com`.

Until DNS + Authorized Domains succeed, use `https://touri-admin-next.vercel.app` and keep Legacy RO Admin as rollback.

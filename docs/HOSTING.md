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

## Deploy command (operator — do not run until CUTOVER_RETRY_GO)

```bash
npx vercel link --yes --project touri-admin-next
npx vercel env pull .env.production.local   # optional local check; gitignored
npx vercel --prod --yes
```

After first link, prefer:

```bash
npm run deploy:prod
```

## Production URL

- Canonical: `https://admin-next.touri-taxi.com`
- Vercel preview / `*.vercel.app` is non-canonical

## Custom domain DNS (Squarespace NS for `touri-taxi.com`)

Operator must create records (see cutover blocker resolution artifact):

| Type  | Name        | Value                                      | Purpose                          |
|-------|-------------|--------------------------------------------|----------------------------------|
| CNAME | `admin-next`| `cname.vercel-dns.com`                     | App hostname (or Vercel-assigned)|
| TXT   | `_vercel`   | (value from Vercel domain UI, if required) | Domain verification              |

Until DNS + Vercel domain attach succeed, `admin-next.touri-taxi.com` remains unreachable.

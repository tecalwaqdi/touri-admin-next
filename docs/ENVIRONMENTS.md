# Environments

| Environment | Purpose | Data | Production write |
|-------------|---------|------|------------------|
| Development | Daily coding | Synthetic mocks | Forbidden (startup fail if enabled) |
| Staging | Realistic test | Test accounts / scrubbed | Forbidden |
| Production (Admin Next) | Future | Later phases | Disabled by default |

## Example files

- `.env.example`
- `.env.development.example`
- `.env.staging.example`
- `.env.production.example`

Copy an example to a local env file. Never commit real secrets.

## Flags

All write/read production flags default to `false`. Enabling any write flag outside production APP_ENV fails validation at startup.

`FINANCE_REPORTING_SOURCE_MODE`:

- development / staging default: `synthetic`
- Production unset → `production_read_only`
- Production explicit `synthetic` / `test` → **startup fail** (fail closed)

# PHASE_4A_1_CONNECTION_PLAN

**PLAN ONLY — do NOT implement in 4A-0.**

Controlled first live Shadow Read sequence.  
**First live read MUST be countries (not `order`).**

## Steps

| Step | Scope | Success criteria |
|---|---|---|
| **4A-1.1** | Auth + fingerprint | Verified token path + `EXPECTED_PROJECT_ID` match; no data collections yet |
| **4A-1.2** | Countries only | `listCountries` via Production repo; allowlist + scope |
| **4A-1.3** | Cities | `listCities`; `AMBIGUOUS_CITY` no auto-pick |
| **4A-1.4** | Small trip query | Date-windowed `order` read; limit≤100; scope intersect |
| **4A-1.5** | Drivers | Scoped driver list/get; six-axis status; field allowlist |
| **4A-1.6** | Agents | Country scope; 1:1; historical warnings |
| **4A-1.7** | Masked customer | Summary only; PII masked; full PII still trapped unless explicitly enabled later |
| **4A-1.8** | Safe financial | `READ_SAFE` / `READ_WITH_WARNING` only; block refund/chargeback/gateway/adjustment |

## Preconditions for 4A-1 GO

- [ ] 4A-0 tests green
- [ ] Production Read still default disabled until explicit enable for controlled window
- [ ] Read-only credentials injected via approved secret path (not git)
- [ ] Fingerprint documented for target project
- [ ] Rollback: flip `PRODUCTION_READ_ENABLED=false` (kill switch)
- [ ] Observability dashboards ready for deny/circuit/kill events
- [ ] No write flags true
- [ ] First query = countries

## Explicit non-goals for 4A-1 first window

- No settlements / ledger / export
- No Production writes
- No Legacy code changes
- No broad unindexed collection scans

# PRODUCTION_READ_INDEX_REQUIREMENTS

**NO index deploy in Phase 4 design.** Classification only.

| Query | Status | Notes |
|---|---|---|
| countries by id / list | likely existing | Stable geo docs |
| cities by countryId | likely existing | Alias resolution is app-side |
| trips by country + createdAt (7d window) | required future | Cursor on createdAt; confirm composite |
| trips by agentId + createdAt | required future | Agent scope lists |
| trips by status_code + createdAt | unknown | Prefer filter after keyed window |
| drivers by countryId | likely existing | user collection filters |
| drivers by online flag | unknown | May be unsupported initially |
| agents by countryId | likely existing | |
| customers by country (summary) | unknown | Search by name = **unsupported initially** (no full scan) |
| phone/email equality search | unsupported initially | Avoid collection scans |

## Search strategy

| Resource | Strategy |
|---|---|
| countries | indexed_exact |
| cities | normalized_exact |
| trips | indexed_exact |
| drivers | normalized_exact |
| agents | indexed_exact |
| customers | unsupported_initially |

Code: `src/infrastructure/production/contracts/QuerySafety.ts`.

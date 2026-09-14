# Legacy Security Rules Analysis

**Read source only — no deploy.**

## Locations

- `Admi/firebase/firestore.rules`
- `ara_oatan_app/firebase/firestore.rules`
- `mndob-main/firebase/firestore.rules`
- Storage: each project's `storage.rules`

## Findings (high level)

1. **Role helpers** in rules: `isSuperAdmin`, `isCountryAdmin`, `isAgent`, `isSupport`, finance, partner, transport — claimBool + profile fields.
2. **Country scoping** via `countriesMatchAdminScope` / `Rev_dolh` comparisons — agents restricted to country.
3. **Order financial immutability**: agent snapshot fields listed as historically immutable after write (rules comments around agent_rate / agent_amount_*).
4. **Agent country assignment** collection matched at `/agent_country_assignment/{countryId}`.
5. **Wallets / transactions / financial_*** collections have dedicated matches — client writes constrained; CF Admin SDK bypasses rules.
6. **Storage**: paths `users/{userId}/**`, `landmarks/**`, `countries/**`, `regions/**`, `cities/**`, `type_car/**`, `representatives/**`, `places/**`, catch-all.

## Risks

| ID | Risk | Severity |
|---|---|---|
| SR-01 | Three rule files may drift across apps | high |
| SR-02 | Claim/profile dual checks (`Isagent` vs claim `agent`) can diverge until sync | medium |
| SR-03 | Client-side order status updates still exist for non-cash accept path | medium |
| SR-04 | Catch-all storage match — review carefully before Admin Next production | high |

## Indexes

`Admi/firebase/firestore.indexes.json` heavy on `order`, `user`, `financial_settlements`, `transactions`, geo collections. Collection group queries present for `order`, `fcm_tokens`, etc.

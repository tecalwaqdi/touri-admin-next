# GEOGRAPHY_CANONICALIZATION_PLAN

Design only — no Legacy data mutation, no production writes.

## Identity rule

`countryId` / `regionId` / `cityId` / `landmarkId` are identity. **Names are NOT primary IDs.**

## Collections (Observed)

- `countries`, `cities`, `villages`, `mkan`
- Aliases: `city_sa_*`, `region_sa_*` (Admin geo alias helpers)
- Scripts promote Taif/Jeddah → city scoping mismatch risk (Phase 3)

## Country canonicalization (Phase 3.7)

Evidence: `toury_country_registry.dart` preferred ids + aliases; `countries_record.dart` (`iso_code`, `currency_code`).

- Table: `CountryCanonicalization.ts` / rows with `legacyId`, `iso2`, `canonicalCountryId`, `aliases`, `confidence`
- `iso3` left null when not in Legacy source (no internet guessing)
- Unmapped country id → `unmapped` (do not invent)

## City aliases (Phase 3.7)

File: `docs/legacy-mapping/legacy-city-aliases.json`  
Evidence: `admin_geo_aliases.dart` + unit tests.

| Outcome | Behavior |
|---|---|
| Single alias match | `cityId` = canonical; `geographyMappingStatus=mapped` |
| Multiple targets | `AMBIGUOUS_CITY`; `cityId=null`; **no auto-pick** |
| Unmapped | `cityId=null`; `geographyMappingStatus=unmapped`; trip may remain displayable; **city-scope ops blocked** |

## Cross-city

`evaluateCrossCityScope`: tripCity ≠ driverCity → `cross_city` + display mismatch.  
**NEVER** relocate trip/driver/city.

## City Scope Contract (future matching rules)

| Scope key | Legacy signal | Future match rule (design) | Confidence today |
|---|---|---|---|
| Trip city | order geo refs / mkan / city fields | Normalize via alias table; missing → null + unmapped | high (aliases proven for SA hubs) |
| Driver city | user location / city refs | Match only when both canonicalized | medium |
| Agent country | `Rev_dloh_agent` + assignment lock | Country match for attribution | high |
| Customer city | user / order pickup geo | Prefer order snapshot | low–medium |

## Matching rule design principles

1. Never fuzzy-match city names across languages without explicit alias map.
2. Alias resolution is a **function of documented alias keys**, not Levenshtein.
3. Country match for agent is authoritative for commission attribution; city is not.
4. Unresolvable geo → `unmapped` / null — do not invent nearest city.
5. Admin Next CanonicalCityReadModel.aliasKeys carries known aliases for future adapter.

## Blockers remaining

- Full alias inventory completeness: unknown without production enumeration (forbidden)
- Landmark/mkan vs city dual identity: residual risk
- Non-Saudi city aliases incomplete in evidence set

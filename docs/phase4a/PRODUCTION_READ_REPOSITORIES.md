# PRODUCTION_READ_REPOSITORIES

Resource-specific repositories — **never** `queryCollection("order")` from application.

| Class | Resource | Collection | Notes |
|---|---|---|---|
| `FirebaseProductionTripReadRepository` | trips | `order` | Date window default 7d, max 31d; cursor; limit≤100; scope intersect |
| `FirebaseProductionDriverReadRepository` | drivers | `user` | Six-axis status mapper; field allowlist; PII masked |
| `FirebaseProductionAgentReadRepository` | agents | `user` | Country scope; 1:1 agent evidence; historical warnings |
| `FirebaseProductionGeographyReadRepository` | geography | `countries` / `villages` / `mkan` | 4A-1 countries; 4A-2 cities←`villages`; 4A-3 landmarks←`mkan`; `AMBIGUOUS_CITY` no auto-pick |
| `FirebaseProductionCustomerReadRepository` | customers | `user` | Summary only; masked PII; `FULL_PII_SHADOW_DISABLED` trap |

## Wiring

`createProductionReadRepositories({ client, productionReadEnabled })`  
Default client in shadow container: `FakeFirestoreReadClient`.  
Real client: `FirebaseAdminFirestoreReadClient` (code present, **not activatable** without gates + credentials).

## Envelopes

Production future responses stamp:

- `sourceEnvironment=production`
- `sourceSystem=legacy`
- `readMode=shadow`
- `mappingVersion=legacy-map-v1`

Synthetic stays `development`/`admin_next_synthetic` — **never mix**.

## Safety

- Collection allowlist: `countries`, `cities` (regions), `villages` (product cities), `mkan` (landmarks), `order`, `user` else `COLLECTION_NOT_ALLOWED`
- Field allowlist + `DO_NOT_EXPOSE_YET` financial: refund/chargeback/gatewayFee/adjustment; landmark `ser`
- Incomplete ≠ zero (`null` + provenance `availabilityStatus=missing`)
- Scope: country_admin cannot expand; agent cannot access other agent → `SCOPE_DENIED`
- Live resource gate: exactly one of `countries` | `cities` | `landmarks` when Production Read enabled

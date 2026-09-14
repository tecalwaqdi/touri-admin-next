# PHASE_4_ARCHITECTURE

**DESIGN ONLY — Phase 4 Controlled Production Read.**  
No Production Firebase connection. No credentials. No real Production adapter.

## Pipeline (mandatory)

```
Browser
  → Admin Next Web (UI)
  → Verified ID Token (Bearer)
  → Backend API (authority)
  → Production Identity Verification
  → RBAC (claims → role → permissions)
  → Scope enforcement (server-built filter)
  → Read Policy (collection/field allowlists)
  → Resource-Specific Production Repository
  → Legacy Mapper
  → Canonical Read Model
  → Field Redaction (PII + DO_NOT_EXPOSE_YET)
  → Response (+ sourceEnvironment/sourceSystem/readMode)
```

**NO Browser → Firestore.** Backend authority only.

## Resource repositories (interfaces only)

| Interface | Resource | Initial scope |
|---|---|---|
| `ProductionTripReadRepository` | trips (`order`) | list/detail + date window |
| `ProductionDriverReadRepository` | drivers | list/detail |
| `ProductionAgentReadRepository` | agents | list/detail |
| `ProductionCustomerReadRepository` | customers | **summary only**, PII masked |
| `ProductionGeographyReadRepository` | countries/cities | list |

**Forbidden:** generic `Firestore.query(collection)`, `/api/read?collection=`.

## Mapping chain

`ProductionTripSourceRecord` → `LegacyTripMapper` → `CanonicalTripReadModel`  
(and Driver / Agent / Customer Summary similarly)

Stamps: `mappingWarnings[]`, `mappingConfidence`, `sourceVersion`, `mappingVersion=legacy-map-v1`, `sourceSchemaVersion=unknown` when absent.

## DI

- `createDevelopmentContainer()` — synthetic app path; writes disabled toward Production
- `createShadowReadContainer()` — verified-auth capable + Production **read** interfaces (fakes) + **all writes = DisabledWriteRepository**
- **DO NOT** create `createProductionWriteContainer()` in Phase 4

## Code locations

- Contracts: `src/infrastructure/production/contracts/`
- Constants: `src/domain/production-read/constants.ts`
- Gate: `src/infrastructure/production/ProductionReadGate.ts`
- Containers: `src/infrastructure/production/container/createContainers.ts`

## Related design docs

See sibling files in `docs/phase4/` and Phase 3.7 artifacts under `docs/legacy-mapping/`.

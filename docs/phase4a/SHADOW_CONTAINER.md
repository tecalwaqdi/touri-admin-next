# SHADOW_CONTAINER

## Factory

`createShadowReadContainer()` only (with `createDevelopmentContainer()`).  
**Forbidden:** `createProductionWriteContainer`.

## Contents

| Port | Implementation |
|---|---|
| `identityVerifier` | Fake / injectable verified-token path |
| `productionReads` | Wired Production repos → Fake Firestore client |
| `writes` | `DisabledWriteRepository` |
| `settlementCommands` | `DisabledSettlementCommandPort` |
| `ledgerCommands` | `DisabledLedgerCommandPort` |
| `driverMutations` | `DisabledDriverMutationPort` |
| `agentMutations` | `DisabledAgentMutationPort` |
| `productionWriteRepos` | `null` |
| `fullPiiShadowEnabled` | `false` (literal) |

## UI mode

- `development_synthetic` (default)
- `production_shadow` only when `PRODUCTION_READ_ENABLED=true` **and** `PRODUCTION_READ_MODE=shadow`

Shadow nav allow: Dashboard, Trips, Drivers, Agents, Customers Summary, Geography, Mapping Health.  
Hide: Settlements, Approvals, Export, Finance mutations, Settings mutations.

## ShadowBanner

EN+AR via `SHADOW_BANNER` — shown only when UI mode is `production_shadow` (inactive by default).

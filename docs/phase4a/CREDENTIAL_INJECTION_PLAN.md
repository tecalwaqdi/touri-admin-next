# CREDENTIAL_INJECTION_PLAN

## Phase 4A-0 (this phase)

| Provider | Behavior |
|---|---|
| `MissingProductionCredentialProvider` | Always throws `PRODUCTION_CREDENTIALS_MISSING` |
| `FakeProductionCredentialProvider` | Test-only fake project id |

App builds & runs **without** Production credentials when read is disabled.

## Fail-closed

- Read enabled + missing credentials → **Fail Startup** (`assertProductionReadStartupOrThrow`)
- **No** silent Mock fallback
- Error messages sanitized (`sanitizeCredentialMessage`) — never leak private keys / tokens

## Fingerprint

`assertExpectedFirebaseProject(expected, actual)`  
Mismatch → `PROJECT_FINGERPRINT_MISMATCH`

## Future injection (4A-1+) — plan only

1. Secret Manager / env-injected JSON path (never committed)
2. Dedicated **read-only** service account (separate from Legacy deploy SA)
3. Wire `ProductionCredentialProvider` implementation that loads from secret ref
4. Still require multi-gate + fingerprint before `FirebaseAdminFactory.getApp()`

## Phase 4A-1 live (ADC only)

| Provider | Behavior |
|---|---|
| `ApplicationDefaultProductionCredentialProvider` | Returns `kind: application_default` for confirmed `EXPECTED_PROJECT_ID` |
| Policy | `GOOGLE_APPLICATION_CREDENTIALS` **must be unset** (no JSON SA keys). Prefer ADC impersonation of dedicated Shadow SA. |

**Do not commit Production credentials. Do not paste private keys.**

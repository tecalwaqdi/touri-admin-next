# OBSERVABILITY_SPEC

## Events (no sensitive logs)

| Event | When |
|---|---|
| `production_read_request` | Allowed Production read attempt |
| `production_read_denied` | Gate / auth / policy deny |
| `scope_denied` | Scope expansion or missing scope |
| `pii_redacted` | Default masking applied |
| `sensitive_field_read` | Full PII revealed under permission (hash actor only) |
| `mapping_warning` | Mapper emitted warning |
| `mapping_failure` | Mapper hard failure / unmapped critical |
| `shadow_comparison_mismatch` | Comparison failed |
| `kill_switch_triggered` | Read kill switch engaged |
| `circuit_breaker_open` | Upstream failures opened breaker |

## Forbidden in logs

Raw tokens, phone, email, claims dumps, service account material, full document dumps.

## Code

`src/infrastructure/production/ObservabilityEvents.ts`

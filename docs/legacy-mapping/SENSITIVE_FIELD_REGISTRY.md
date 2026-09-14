# SENSITIVE_FIELD_REGISTRY

| Field | Resource | Sensitivity | Read permission | PII permission | Notes |
|---|---|---|---|---|---|
| phone | customer | identity_sensitive | customers:read | customers:read_pii | Masked unless PII perm |
| email | customer | identity_sensitive | customers:read | customers:read_pii | Masked unless PII perm |
| phone | driver | identity_sensitive | drivers:read | drivers:read_pii | Masked unless PII perm |
| email | driver | identity_sensitive | drivers:read | drivers:read_pii | Masked unless PII perm |
| customerId | trip | identity_sensitive | trips:read | — | Operational identity |
| refundAmount | financial_trip | financial_sensitive | — | — | DO_NOT_EXPOSE_YET |
| chargebackAmount | financial_trip | financial_sensitive | — | — | DO_NOT_EXPOSE_YET |
| gatewayFee | financial_trip | financial_sensitive | — | — | DO_NOT_EXPOSE_YET |
| adjustmentAmount | financial_trip | financial_sensitive | — | — | DO_NOT_EXPOSE_YET |

Code mirror: `src/domain/read/SensitiveFieldRegistry.ts`

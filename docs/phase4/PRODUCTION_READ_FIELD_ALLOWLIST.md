# PRODUCTION_READ_FIELD_ALLOWLIST

**Allowlist (not denylist-only).** Unknown fields are denied/omitted.

## Operational fields (initial)

`id`, `status`, `paymentStatus`, `customerId`, `driverId`, `agentId`, `countryId`, `cityId`, `currencyCode`, `createdAtUtc`, `completedAtUtc`, `displayName`, `name`, `phone`, `email`, `verification`, `blocked`, `registrationAxis`, `accountActive`, `online`, `available`, `onTrip`, `isAgent`, `agentTotalPercent`, `appCommissionPercentStored`, `vatPercentStored`, `assignmentLockDocId`, `lastActivityAtUtc`, `mappingConfidence`, `mappingVersion`, `incompleteReasons`

Note: `phone` / `email` remain **PII-masked by default**.

## Financial fields

| Exposure | Fields |
|---|---|
| READ_SAFE | grossFare, finalCustomerAmount, vatAmount, platformCommissionAmount, driverGross, driverNet, customerId, tripStatus (operational) |
| READ_WITH_WARNING | vatRate, platformCommissionRate, agentCommissionAmount, agentCommissionRate, driverDeductions, cashCollected, onlineCollected, agentId |
| **DO_NOT_EXPOSE_YET** | **refundAmount, chargebackAmount, gatewayFee, adjustmentAmount** |

Code: `src/infrastructure/production/contracts/FieldAllowlist.ts` + `FinancialFieldClassification.ts`.

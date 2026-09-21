/**
 * Phase 4 DESIGN — field ALLOWLIST (not denylist-only).
 * Unknown fields are omitted / denied for Production responses.
 */

import {
  CANONICAL_FIELD_CLASSIFICATIONS,
  classificationFor,
} from "@/domain/canonical/FinancialFieldClassification";

export type FieldAllowDecision =
  | { allow: true; exposure: "READ_SAFE" | "READ_WITH_WARNING" | "PUBLIC" }
  | { allow: false; reason: "unknown_field" | "DO_NOT_EXPOSE_YET" | "not_in_allowlist" };

/** Non-financial operational fields allowed on initial shadow resources. */
export const OPERATIONAL_FIELD_ALLOWLIST = [
  "id",
  "status",
  "paymentStatus",
  "customerId",
  "driverId",
  "agentId",
  "countryId",
  "cityId",
  "regionId",
  "currencyCode",
  "createdAtUtc",
  "completedAtUtc",
  "displayName",
  "name",
  "safeName",
  "phone", // still PII-masked by default
  "email", // still PII-masked by default
  "verification",
  "blocked",
  "registrationAxis",
  "accountActive",
  "online",
  "available",
  "onTrip",
  "isAgent",
  "agentTotalPercent",
  "appCommissionPercentStored",
  "vatPercentStored",
  "assignmentLockDocId",
  "lastActivityAtUtc",
  "mappingConfidence",
  "mappingVersion",
  "incompleteReasons",
  "sourceDocumentId",
  "canonicalLandmarkId",
  "canonicalCityId",
  "canonicalDriverId",
  "authUid",
  "registrationStatus",
  "accountEnabled",
  "onlineStatus",
  "availabilityStatus",
  "tripState",
  "complianceStatus",
  "vehicle",
  "compliance",
  "financial",
  "createdAtUtc",
  "statusWarnings",
  "isDriver",
  "discriminatorField",
  "countrySourcePath",
  "citySourcePath",
  "activeStatus",
  "mappingStatus",
  "imageSummary",
  "coordinates",
  "hasImage",
  "imageCount",
  "storageKind",
  "imagePresence",
  "imageStorageKind",
] as const;

export const DO_NOT_EXPOSE_FINANCIAL_FIELDS = [
  "refundAmount",
  "chargebackAmount",
  "gatewayFee",
  "adjustmentAmount",
] as const;

export function isDoNotExposeField(field: string): boolean {
  return (DO_NOT_EXPOSE_FINANCIAL_FIELDS as readonly string[]).includes(field);
}

export function decideFieldAllow(field: string): FieldAllowDecision {
  if (isDoNotExposeField(field)) {
    return { allow: false, reason: "DO_NOT_EXPOSE_YET" };
  }

  const financial = classificationFor(field);
  if (financial) {
    if (financial.exposure === "DO_NOT_EXPOSE_YET") {
      return { allow: false, reason: "DO_NOT_EXPOSE_YET" };
    }
    if (
      financial.exposure === "READ_SAFE" ||
      financial.exposure === "READ_WITH_WARNING"
    ) {
      return { allow: true, exposure: financial.exposure };
    }
    return { allow: false, reason: "not_in_allowlist" };
  }

  if ((OPERATIONAL_FIELD_ALLOWLIST as readonly string[]).includes(field)) {
    return { allow: true, exposure: "PUBLIC" };
  }

  return { allow: false, reason: "unknown_field" };
}

/**
 * Project a record through the allowlist. Unknown + DO_NOT_EXPOSE fields dropped.
 */
export function projectAllowedFields<T extends Record<string, unknown>>(
  record: T,
): { data: Partial<T>; deniedFields: string[] } {
  const data: Partial<T> = {};
  const deniedFields: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const decision = decideFieldAllow(key);
    if (!decision.allow) {
      deniedFields.push(key);
      continue;
    }
    (data as Record<string, unknown>)[key] = value;
  }
  return { data, deniedFields };
}

export function listReadSafeFinancialFields(): string[] {
  return CANONICAL_FIELD_CLASSIFICATIONS.filter(
    (c) =>
      c.exposure === "READ_SAFE" || c.exposure === "READ_WITH_WARNING",
  ).map((c) => c.canonicalField);
}

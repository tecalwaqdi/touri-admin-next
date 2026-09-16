/**
 * Fleet / transport companies — Legacy `transport_company` collection.
 * Distinct domain from partners (partner landmarks) and drivers.
 */

export type FleetActiveStatus = "active" | "inactive" | "unknown";

export type CanonicalTransportCompanyReadModel = {
  id: string;
  sourceDocumentId: string;
  displayName: string | null;
  licenseNumber: string | null;
  countryId: string | null;
  countryText: string | null;
  phone: string | null;
  email: string | null;
  activeStatus: FleetActiveStatus;
  ownerUserId: string | null;
  source: "legacy_transport_company";
  warnings: string[];
};

export const FLEET_METADATA_ALLOWLIST = [
  "naim",
  "license_number",
  "Rev_dolh",
  "dolh_text",
  "phone",
  "email",
  "actev",
  "owner_user",
] as const;

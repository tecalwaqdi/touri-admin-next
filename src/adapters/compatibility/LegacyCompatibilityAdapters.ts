/**
 * Compatibility adapters — map Legacy field names ↔ Admin Next canonical models.
 * No Production migration execution. Adapters are read/write-shape only.
 */

import { mapRegionFromLegacyDoc } from "@/infrastructure/production/mappers/mapRegionFromLegacyDoc";
import { mapVehicleTypeFromLegacyDoc } from "@/infrastructure/production/mappers/mapVehicleTypeFromLegacyDoc";
import { mapTransportCompanyFromLegacyDoc } from "@/infrastructure/production/mappers/mapTransportCompanyFromLegacyDoc";
import { mapTourGuideFromLegacyUser } from "@/infrastructure/production/mappers/mapTourGuideFromLegacyUser";
import { isPartnerLandmark } from "@/domain/partners/PartnerLandmarkPolicy";
import { resolveDriverVehicleTypeSelection } from "@/domain/vehicle-catalog/VehicleTypeMaster";

export const LEGACY_COMPATIBILITY_ADAPTERS = {
  region: {
    legacyCollection: "cities",
    nextResource: "regions",
    map: mapRegionFromLegacyDoc,
    notes: "Country→Region→City→Landmark; regionId nullable",
  },
  vehicleType: {
    legacyCollection: "type_car",
    nextResource: "vehicle-catalog",
    map: mapVehicleTypeFromLegacyDoc,
    driverSelection: resolveDriverVehicleTypeSelection,
    notes: "Canonical select + free-text text_type_car_mndob compat",
  },
  partnerLandmark: {
    legacyCollection: "mkan",
    nextResource: "partners",
    predicate: isPartnerLandmark,
    notes: "Partners = isShrek filter; not a separate collection",
  },
  fleet: {
    legacyCollection: "transport_company",
    nextResource: "fleet",
    map: mapTransportCompanyFromLegacyDoc,
    notes: "Distinct fleet domain",
  },
  tourGuide: {
    legacyCollection: "user",
    nextResource: "guides",
    map: mapTourGuideFromLegacyUser,
    notes: "is_tour_guide personas; soft status only",
  },
} as const;

export const PRODUCTION_MIGRATION_EXECUTION = {
  enabled: false,
  reason: "Adapters only — no Production data migration in this phase",
} as const;

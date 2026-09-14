/**
 * Fixture-only mapping health projection for /admin-next-health/mapping.
 * No production Firestore. Uses local fixtures + resolvers.
 */

import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { resolveCityId } from "@/domain/geography/CityAliasResolver";
import { evaluateCrossCityScope } from "@/domain/geography/CrossCityScope";
import { mapLegacyTripStatusContract } from "@/domain/canonical/legacyStatusContract";
import { COUNTRY_CANONICAL_TABLE } from "@/domain/geography/CountryCanonicalization";
import { loadCityAliases } from "@/domain/geography/CityAliasResolver";

export type MappingHealthSnapshot = {
  generatedAt: string;
  mode: "fixtures_only";
  countriesMapped: number;
  cityAliases: number;
  sampleCountry: ReturnType<typeof resolveCanonicalCountryId>;
  sampleCity: ReturnType<typeof resolveCityId>;
  sampleCrossCity: ReturnType<typeof evaluateCrossCityScope>;
  sampleUnknownStatus: ReturnType<typeof mapLegacyTripStatusContract>;
  productionReadEnabled: false;
};

export function buildFixtureMappingHealth(): MappingHealthSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    mode: "fixtures_only",
    countriesMapped: COUNTRY_CANONICAL_TABLE.length,
    cityAliases: loadCityAliases().length,
    sampleCountry: resolveCanonicalCountryId("country_sa"),
    sampleCity: resolveCityId("city_jeddah"),
    sampleCrossCity: evaluateCrossCityScope({
      tripCityId: "city_sa_jeddah",
      driverCityId: "city_sa_riyadh",
    }),
    sampleUnknownStatus: mapLegacyTripStatusContract("not_a_real_status"),
    productionReadEnabled: false,
  };
}

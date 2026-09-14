/**
 * Phase 4B — cross-resource referential validation (bounded pages only).
 * Does NOT invent relations. Legitimate absence / excluded* / not_represented
 * are allowed and do not count as broken references.
 */

import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import type {
  CanonicalCityReadModel,
  CanonicalCountryReadModel,
  CanonicalLandmarkReadModel,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";

/** Statuses that mean "do not require a resolvable geography edge". */
const GEO_ABSENCE_OK = new Set([
  "not_represented",
  "geographyNotRepresented",
  "not_applicable",
  "testOrNoncanonical",
  "excludedNonDriver",
  "excludedNonAgent",
  "excludedNonCustomer",
  "excludedUnknownIdentity",
  "malformed",
  "unknownDiscriminator",
  "unmappedCountry",
  "unmappedCity",
  "ambiguousCountry",
  "ambiguousCity",
]);

export type CrossResourceMaps = {
  countryIds: ReadonlySet<string>;
  cityIds: ReadonlySet<string>;
};

export type CrossResourceValidationResult = {
  brokenCountryReferences: number;
  brokenCityReferences: number;
  details: string[];
};

function countryValue(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  return t.length ? t : null;
}

/**
 * A required country/city edge is broken only when the resource claims a
 * concrete represented id that is absent from the bounded geography page.
 */
export function validateCrossResourceReferences(input: {
  countries: CanonicalCountryReadModel[];
  cities: CanonicalCityReadModel[];
  landmarks: CanonicalLandmarkReadModel[];
  trips: CanonicalTripReadModel[];
  drivers: CanonicalDriverReadModel[];
  agents: CanonicalAgentReadModel[];
  customers: CanonicalCustomerReadModel[];
}): CrossResourceValidationResult {
  const countryIds = new Set(
    input.countries.map((c) => c.id).filter((id) => id && id.trim()),
  );
  const cityIds = new Set(
    input.cities.map((c) => c.sourceDocumentId || c.id).filter(Boolean),
  );
  // Also accept canonical city ids from the page.
  for (const c of input.cities) {
    if (c.canonicalCityId) cityIds.add(c.canonicalCityId);
    if (c.id) cityIds.add(c.id);
  }

  let brokenCountryReferences = 0;
  let brokenCityReferences = 0;
  const details: string[] = [];

  // Cities → country
  for (const city of input.cities) {
    if (GEO_ABSENCE_OK.has(city.mappingStatus)) continue;
    const cid = countryValue(city.countryId);
    if (!cid) continue;
    if (city.mappingStatus === "validMapped" && !countryIds.has(cid)) {
      // Only count when country page is non-empty (bounded — empty catalog = skip).
      if (countryIds.size > 0) {
        brokenCountryReferences += 1;
        details.push(`city:${city.sourceDocumentId}->country:${cid}`);
      }
    }
  }

  // Landmarks → country/city
  for (const lm of input.landmarks) {
    if (GEO_ABSENCE_OK.has(lm.mappingStatus)) continue;
    if (lm.mappingStatus !== "validMapped") continue;
    const cid = countryValue(lm.canonicalCountryId || lm.countryId);
    if (cid && countryIds.size > 0 && !countryIds.has(cid)) {
      brokenCountryReferences += 1;
      details.push(`landmark:${lm.sourceDocumentId}->country:${cid}`);
    }
    const cityId = countryValue(lm.cityId);
    if (cityId && cityIds.size > 0 && !cityIds.has(cityId)) {
      brokenCityReferences += 1;
      details.push(`landmark:${lm.sourceDocumentId}->city:${cityId}`);
    }
  }

  // Trips — only when country/city represented
  for (const trip of input.trips) {
    if (GEO_ABSENCE_OK.has(trip.mappingStatus)) continue;
    const countryId = countryValue(
      trip.canonicalCountryId || trip.countryId.value,
    );
    if (
      countryId &&
      trip.countryId.value &&
      countryIds.size > 0 &&
      !countryIds.has(countryId)
    ) {
      // Trip country missing from bounded country page — only when trip claims mapped country
      if (trip.mappingStatus === "validMapped") {
        brokenCountryReferences += 1;
        details.push(`trip:${trip.sourceDocumentId}->country:${countryId}`);
      }
    }
    const cityId = countryValue(
      trip.sourceCityDocumentId || trip.cityId.value,
    );
    // city_not_represented / empty city → skip (legitimate)
    if (
      cityId &&
      trip.cityId.value &&
      cityIds.size > 0 &&
      !cityIds.has(cityId) &&
      trip.mappingStatus === "validMapped" &&
      !trip.incompleteReasons.includes("city_not_represented")
    ) {
      // Only broken if trip asserts a city that was supposed to be known
      const cityKnown =
        trip.cityId.provenance?.availabilityStatus === "available" ||
        (trip.cityId.value != null &&
          !trip.incompleteReasons.some((r) =>
            /city_not_represented|city_missing/i.test(r),
          ));
      if (cityKnown) {
        brokenCityReferences += 1;
        details.push(`trip:${trip.sourceDocumentId}->city:${cityId}`);
      }
    }
  }

  // Drivers
  for (const d of input.drivers) {
    if (GEO_ABSENCE_OK.has(d.mappingStatus)) continue;
    if (d.mappingStatus !== "validMapped") continue;
    const cid = countryValue(d.countryId.value);
    if (cid && countryIds.size > 0 && !countryIds.has(cid)) {
      brokenCountryReferences += 1;
      details.push(`driver:${d.sourceDocumentId}->country:${cid}`);
    }
    const cityId = countryValue(d.cityId.value);
    if (cityId && cityIds.size > 0 && !cityIds.has(cityId)) {
      brokenCityReferences += 1;
      details.push(`driver:${d.sourceDocumentId}->city:${cityId}`);
    }
  }

  // Agents — country required when validMapped
  for (const a of input.agents) {
    if (GEO_ABSENCE_OK.has(a.mappingStatus)) continue;
    if (a.mappingStatus !== "validMapped") continue;
    const cid = countryValue(a.countryId.value);
    if (cid && countryIds.size > 0 && !countryIds.has(cid)) {
      brokenCountryReferences += 1;
      details.push(`agent:${a.sourceDocumentId}->country:${cid}`);
    }
  }

  // Customers — geography optional (not_represented OK)
  for (const c of input.customers) {
    if (GEO_ABSENCE_OK.has(c.mappingStatus)) continue;
    if (c.geographyRepresentation === "not_represented") continue;
    if (c.geographyRepresentation === "not_applicable") continue;
    if (c.mappingStatus !== "validMapped") continue;
    const cid = countryValue(c.countryId.value);
    if (cid && countryIds.size > 0 && !countryIds.has(cid)) {
      brokenCountryReferences += 1;
      details.push(`customer:${c.sourceDocumentId}->country:${cid}`);
    }
    const cityId = countryValue(c.cityId.value);
    if (cityId && cityIds.size > 0 && !cityIds.has(cityId)) {
      brokenCityReferences += 1;
      details.push(`customer:${c.sourceDocumentId}->city:${cityId}`);
    }
  }

  return { brokenCountryReferences, brokenCityReferences, details };
}

export function isLegitimateGeographyAbsence(status: string): boolean {
  return GEO_ABSENCE_OK.has(status);
}

/**
 * P0 catalog reads — vehicle types, fleet, partners (landmark filter), guides.
 * Production WIF-native when read path active; Fake seed for offline unit tests.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { mapVehicleTypeFromLegacyDoc } from "@/infrastructure/production/mappers/mapVehicleTypeFromLegacyDoc";
import { mapTransportCompanyFromLegacyDoc } from "@/infrastructure/production/mappers/mapTransportCompanyFromLegacyDoc";
import { mapTourGuideFromLegacyUser } from "@/infrastructure/production/mappers/mapTourGuideFromLegacyUser";
import { isPartnerLandmark } from "@/domain/partners/PartnerLandmarkPolicy";
import { mapLandmarkFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { loadCityAliases } from "@/domain/geography/CityAliasResolver";
import {
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

export type CatalogReadClient = Pick<FirestoreReadClient, "query" | "getDocument">;

function sourceMeta(ids: string[]) {
  return resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: ids,
  });
}

export async function listVehicleTypes(
  client: CatalogReadClient,
  opts?: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const result = await client.query({
    collection: "type_car",
    filters: [],
    orderBy: [{ field: "naim", direction: "asc" }],
    limit,
    startAfterCursor: opts?.cursor ?? null,
  });
  const items = result.docs
    .filter((d) => d.exists && d.data)
    .map((d) =>
      mapVehicleTypeFromLegacyDoc({ documentId: d.id, data: d.data! }),
    );
  return {
    items,
    nextCursor: result.nextCursor ?? null,
    truncated: result.nextCursor != null,
    ...sourceMeta(items.map((i) => i.sourceDocumentId)),
    accuracy: "bounded_page" as const,
  };
}

export async function getVehicleType(
  client: CatalogReadClient,
  id: string,
) {
  const doc = await client.getDocument("type_car", id.trim());
  if (!doc?.exists || !doc.data) return null;
  return {
    item: mapVehicleTypeFromLegacyDoc({ documentId: doc.id, data: doc.data }),
    ...sourceMeta([doc.id]),
    accuracy: "single_document" as const,
  };
}

export async function listFleetCompanies(
  client: CatalogReadClient,
  opts?: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const result = await client.query({
    collection: "transport_company",
    filters: [],
    orderBy: [{ field: "naim", direction: "asc" }],
    limit,
    startAfterCursor: opts?.cursor ?? null,
  });
  const items = result.docs
    .filter((d) => d.exists && d.data)
    .map((d) =>
      mapTransportCompanyFromLegacyDoc({ documentId: d.id, data: d.data! }),
    );
  return {
    items,
    nextCursor: result.nextCursor ?? null,
    truncated: result.nextCursor != null,
    ...sourceMeta(items.map((i) => i.sourceDocumentId)),
    accuracy: "bounded_page" as const,
  };
}

export async function getFleetCompany(client: CatalogReadClient, id: string) {
  const doc = await client.getDocument("transport_company", id.trim());
  if (!doc?.exists || !doc.data) return null;
  return {
    item: mapTransportCompanyFromLegacyDoc({
      documentId: doc.id,
      data: doc.data,
    }),
    ...sourceMeta([doc.id]),
    accuracy: "single_document" as const,
  };
}

export async function listPartnerLandmarks(
  client: CatalogReadClient,
  opts?: { limit?: number; cursor?: string | null; countryId?: string },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const aliases = loadCityAliases();
  // Server-side partner filter — avoids empty UI when partners fall outside
  // the first alphabetical page of all landmarks.
  let result;
  try {
    result = await client.query({
      collection: "mkan",
      filters: [{ field: "isShrek", op: "==", value: true }],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit,
      startAfterCursor: opts?.cursor ?? null,
    });
  } catch {
    // Fallback if composite index missing: bounded page + post-filter.
    result = await client.query({
      collection: "mkan",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit: Math.min(limit * 5, 50),
      startAfterCursor: opts?.cursor ?? null,
    });
  }
  const items = result.docs
    .filter((d) => d.exists && d.data && isPartnerLandmark(d.data))
    .map((d) => {
      const mapped = mapLandmarkFromLegacyDoc({
        documentId: d.id,
        data: d.data!,
        aliases,
      });
      return {
        partnerLandmarkId: mapped.sourceDocumentId,
        displayName: mapped.safeName,
        displayNameAr: mapped.nameAr ?? null,
        displayNameEn: mapped.nameEn ?? null,
        countryId: mapped.canonicalCountryId || mapped.countryId || null,
        cityId: mapped.cityId || null,
        activeStatus: mapped.activeStatus,
        partnerFlag: true as const,
        source: "legacy_mkan_partners" as const,
      };
    })
    .filter((i) =>
      opts?.countryId ? i.countryId === opts.countryId : true,
    )
    .slice(0, limit);
  return {
    items,
    nextCursor: result.nextCursor ?? null,
    truncated: result.nextCursor != null,
    ...sourceMeta(items.map((i) => i.partnerLandmarkId)),
    accuracy: "bounded_page" as const,
    note: "Partners = mkan where isShrek==true (not a separate collection)",
  };
}

export async function listTourGuides(
  client: CatalogReadClient,
  opts?: { limit?: number; cursor?: string | null; status?: string },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const result = await client.query({
    collection: "user",
    filters: [{ field: "is_tour_guide", op: "==", value: true }],
    orderBy: [{ field: "__name__", direction: "asc" }],
    limit,
    startAfterCursor: opts?.cursor ?? null,
  });
  const items = result.docs
    .filter((d) => d.exists && d.data)
    .map((d) => mapTourGuideFromLegacyUser({ documentId: d.id, data: d.data! }))
    .filter((g): g is NonNullable<typeof g> => g != null)
    .filter((g) => (opts?.status ? g.status === opts.status : true));
  return {
    items,
    nextCursor: result.nextCursor ?? null,
    truncated: result.nextCursor != null,
    ...sourceMeta(items.map((i) => i.sourceDocumentId)),
    accuracy: "bounded_page" as const,
  };
}

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

function mapPartnerLandmarkItem(
  documentId: string,
  data: Record<string, unknown>,
  aliases: ReturnType<typeof loadCityAliases>,
) {
  const mapped = mapLandmarkFromLegacyDoc({
    documentId,
    data,
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
}

export async function listPartnerLandmarks(
  client: CatalogReadClient,
  opts?: { limit?: number; cursor?: string | null; countryId?: string },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const aliases = loadCityAliases();
  // Index-free equality + __name__ (same pattern as listTourGuides). Avoids
  // isShrek+naim composite index miss → empty pages with a misleading cursor.
  let result;
  try {
    result = await client.query({
      collection: "mkan",
      filters: [{ field: "isShrek", op: "==", value: true }],
      orderBy: [{ field: "__name__", direction: "asc" }],
      limit: Math.min(limit * 3, 50),
      startAfterCursor: opts?.cursor ?? null,
    });
  } catch {
    // Bounded scan + post-filter when equality query still unavailable.
    // Accumulate until page is filled or cursor exhausted (capped).
    const items: ReturnType<typeof mapPartnerLandmarkItem>[] = [];
    let cursor = opts?.cursor ?? null;
    let nextCursor: string | null = null;
    let scans = 0;
    while (items.length < limit && scans < 8) {
      scans += 1;
      const page = await client.query({
        collection: "mkan",
        filters: [],
        orderBy: [{ field: "__name__", direction: "asc" }],
        limit: 50,
        startAfterCursor: cursor,
      });
      for (const d of page.docs) {
        if (!d.exists || !d.data || !isPartnerLandmark(d.data)) continue;
        const mapped = mapPartnerLandmarkItem(d.id, d.data, aliases);
        if (opts?.countryId && mapped.countryId !== opts.countryId) continue;
        items.push(mapped);
        if (items.length >= limit) break;
      }
      nextCursor = page.nextCursor ?? null;
      cursor = nextCursor;
      if (!nextCursor) break;
    }
    return {
      items: items.slice(0, limit),
      nextCursor: items.length >= limit ? nextCursor : null,
      truncated: nextCursor != null && items.length >= limit,
      ...sourceMeta(items.slice(0, limit).map((i) => i.partnerLandmarkId)),
      accuracy: "bounded_page" as const,
      note: "Partners = mkan where isShrek==true (not a separate collection)",
    };
  }
  const items = result.docs
    .filter((d) => d.exists && d.data && isPartnerLandmark(d.data))
    .map((d) => mapPartnerLandmarkItem(d.id, d.data!, aliases))
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

function strField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function getPartnerLandmark(
  client: CatalogReadClient,
  id: string,
) {
  const aliases = loadCityAliases();
  const doc = await client.getDocument("mkan", id.trim());
  if (!doc?.exists || !doc.data || !isPartnerLandmark(doc.data)) return null;
  const mapped = mapLandmarkFromLegacyDoc({
    documentId: doc.id,
    data: doc.data,
    aliases,
  });
  const data = doc.data;
  return {
    item: {
      kind: "partner" as const,
      partnerLandmarkId: mapped.sourceDocumentId,
      displayName: mapped.safeName,
      displayNameAr: mapped.nameAr ?? null,
      displayNameEn: mapped.nameEn ?? null,
      countryId: mapped.canonicalCountryId || mapped.countryId || null,
      cityId: mapped.cityId || null,
      regionId: mapped.regionId || null,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      partnerFlag: true as const,
      coordinates: mapped.coordinates,
      contactPhoneHint: maskContact(
        strField(data.mdh ?? data.phone ?? data.phone_number),
      ),
      contactEmailHint: maskContact(
        strField(data.EmailUser ?? data.email),
      ),
      addressText: strField(data.address ?? data.adress ?? data.naim_address),
      operationalNotes: strField(data.notes ?? data.note),
      imageSlotsPresent: mapped.imageSummary?.imageCount ?? 0,
      imagePresence: mapped.imageSummary?.hasImage
        ? ("present" as const)
        : ("missing" as const),
      imageCount: mapped.imageSummary?.imageCount ?? 0,
      descriptionAr: strField(data.osf),
      descriptionEn: strField(
        (data.osf_i18n as Record<string, unknown> | undefined)?.en ??
          (data.osf_i18n as Record<string, unknown> | undefined)?.EN,
      ),
      category: strField(data.tsnef ?? data.category),
      source: "legacy_mkan_partners" as const,
      warnings: mapped.warnings ?? [],
    },
    ...sourceMeta([doc.id]),
    accuracy: "single_document" as const,
  };
}

function maskContact(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.includes("@")) {
    const [u, d] = raw.split("@");
    if (!d) return "***";
    return `${(u ?? "").slice(0, 1)}***@${d}`;
  }
  if (raw.length <= 4) return "*".repeat(raw.length);
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
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

export async function getTourGuide(client: CatalogReadClient, id: string) {
  const doc = await client.getDocument("user", id.trim());
  if (!doc?.exists || !doc.data) return null;
  const mapped = mapTourGuideFromLegacyUser({
    documentId: doc.id,
    data: doc.data,
  });
  if (!mapped) return null;
  const data = doc.data;
  const permitRaw =
    data.tour_guide_permit_url ?? data.tour_guide_permit_storage_path;
  const permitPresent =
    typeof permitRaw === "string" && permitRaw.trim().length > 0;
  const permitUrl =
    typeof permitRaw === "string" &&
    /^https:\/\//i.test(permitRaw.trim())
      ? permitRaw.trim()
      : null;
  const rejectionReason =
    typeof data.tour_guide_rejection_reason === "string"
      ? data.tour_guide_rejection_reason.trim().slice(0, 280) || null
      : null;
  const reviewedAt =
    data.tour_guide_reviewed_at instanceof Date
      ? data.tour_guide_reviewed_at.toISOString()
      : typeof data.tour_guide_reviewed_at === "string"
        ? data.tour_guide_reviewed_at
        : null;
  return {
    item: {
      kind: "guide" as const,
      id: mapped.id,
      displayName: mapped.displayName,
      emailHint: mapped.emailHint,
      phoneHint: mapped.phoneHint,
      countryId: mapped.countryId,
      status: mapped.status,
      isTourGuide: true as const,
      transportCompanyText: mapped.transportCompanyText,
      permitPresent,
      permitUrl,
      rejectionReasonPresent: Boolean(rejectionReason),
      rejectionReasonText: rejectionReason,
      reviewedAtUtc: reviewedAt,
      cityText: strField(data.city ?? data.city_name ?? data.mndob_vill),
      source: mapped.source,
      warnings: mapped.warnings,
    },
    ...sourceMeta([doc.id]),
    accuracy: "single_document" as const,
  };
}

/**
 * P0 Region list/detail API reads — Legacy `cities` as regions.
 */

import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";

export type GeographyRegionListItem = {
  regionId: string;
  sourceDocumentId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  countryId: string | null;
  activeStatus: string;
  mappingStatus: string;
  sorting: number | null;
  /** Nullable — never fabricated. */
  regionParentNote: "nullable_ok";
};

function clampLimit(raw: string | null): number {
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(1, Math.floor(n)), WIF_NATIVE_MAX_READ_LIMIT);
}

export async function listProductionRegionsApi(
  actor: ApiActorContext,
  request: Request,
) {
  const runtime = await getProductionOperationalReadRuntime();
  const ctx = productionReadContextFromActor(actor);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");
  const countryId = url.searchParams.get("countryId") ?? undefined;

  const geo = runtime.repos.geography;
  if (!geo.listRegions) {
    throw new Error("REGIONS_READ_NOT_IMPLEMENTED");
  }

  const page = await geo.listRegions(
    ctx,
    { countryId, countryIds: countryId ? [countryId] : undefined },
    { limit, cursor },
  );

  const items: GeographyRegionListItem[] = page.items.map((e) => ({
    regionId: e.data.sourceDocumentId,
    sourceDocumentId: e.data.sourceDocumentId,
    displayName: e.data.safeName,
    displayNameAr: e.data.nameAr ?? null,
    displayNameEn: e.data.nameEn ?? null,
    countryId: e.data.countryId,
    activeStatus: e.data.activeStatus,
    mappingStatus: e.data.mappingStatus,
    sorting: e.data.sorting,
    regionParentNote: "nullable_ok",
  }));

  const source = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: items.map((i) => i.sourceDocumentId),
  });

  return {
    items,
    nextCursor: page.nextCursor ?? null,
    truncated: page.truncated === true,
    ...source,
    sourceEnvironment: "production" as const,
    sourceSystem: "legacy" as const,
    accuracy: "bounded_page" as const,
    hierarchy: "country→region→city→landmark" as const,
  };
}

export async function getProductionRegionDetailApi(
  actor: ApiActorContext,
  regionId: string,
) {
  const runtime = await getProductionOperationalReadRuntime();
  const ctx = productionReadContextFromActor(actor);
  const geo = runtime.repos.geography;
  if (!geo.getRegionById) {
    throw new Error("REGIONS_READ_NOT_IMPLEMENTED");
  }
  const envelope = await geo.getRegionById(ctx, regionId);
  if (!envelope) throw new ProductionDetailNotFoundError("region", regionId);
  assertDetailResourceInScope(actor.user.scope, {
    countryId: envelope.data.countryId,
  });

  const source = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: [envelope.data.sourceDocumentId],
  });

  return {
    regionId: envelope.data.sourceDocumentId,
    sourceDocumentId: envelope.data.sourceDocumentId,
    displayName: envelope.data.safeName,
    displayNameAr: envelope.data.nameAr ?? null,
    displayNameEn: envelope.data.nameEn ?? null,
    countryId: envelope.data.countryId,
    activeStatus: envelope.data.activeStatus,
    mappingStatus: envelope.data.mappingStatus,
    sorting: envelope.data.sorting,
    warnings: envelope.data.warnings,
    regionParentNote: "nullable_ok" as const,
    ...source,
    accuracy: "single_document" as const,
  };
}

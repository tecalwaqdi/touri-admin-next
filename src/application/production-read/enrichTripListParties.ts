/**
 * Bounded list enrichment — resolve party/landmark display names for a page of trips.
 * Dedupes IDs; fail-soft on related-read errors (names stay null).
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import type { TripListItem } from "@/application/production-read/listDtos";
import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { resolveOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";
import { PRODUCTION_DETAIL_RELATED_READ_LIMIT } from "@/application/production-read/detailScope";

function landmarkDisplayName(data: {
  nameEn?: string | null;
  nameAr?: string | null;
  safeName?: string | null;
}): string | null {
  return (
    data.nameEn?.trim() ||
    data.nameAr?.trim() ||
    data.safeName?.trim() ||
    null
  );
}

async function mapUniqueIds(
  ids: Array<string | null | undefined>,
  limit: number,
  load: (id: string) => Promise<string | null>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].slice(
    0,
    limit,
  );
  const out = new Map<string, string | null>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        out.set(id, await load(id));
      } catch {
        out.set(id, null);
      }
    }),
  );
  return out;
}

export async function enrichTripListParties(
  ctx: ApiActorContext,
  items: TripListItem[],
): Promise<TripListItem[]> {
  if (items.length === 0) return items;
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const budget = PRODUCTION_DETAIL_RELATED_READ_LIMIT;

  const customers = await mapUniqueIds(
    items.map((i) =>
      i.customerIdKnowledge === "known" ? i.customerId : null,
    ),
    budget,
    async (id) => {
      const env = await runtime.repos.customers.getSummaryById(readCtx, id);
      if (!env) return null;
      return resolveOperationalDisplayName({
        displayName: env.data.displayName.value,
        emailHint: env.data.emailHint?.value ?? env.data.email?.value,
        phoneHint: env.data.phoneHint?.value ?? env.data.phone?.value,
        id: env.data.id,
      });
    },
  );

  const drivers = await mapUniqueIds(
    items.map((i) => (i.driverIdKnowledge === "known" ? i.driverId : null)),
    budget,
    async (id) => {
      const env = await runtime.repos.drivers.getById(readCtx, id);
      if (!env) return null;
      return resolveOperationalDisplayName({
        displayName: env.data.displayName.value,
        id: env.data.id,
      });
    },
  );

  const geo = runtime.repos.geography;
  const landmarks =
    typeof geo.getLandmarkById === "function"
      ? await mapUniqueIds(
          items.flatMap((i) => [
            i.pickupLandmarkKnowledge === "known" ? i.pickupLandmarkId : null,
            i.destinationLandmarkKnowledge === "known"
              ? i.destinationLandmarkId
              : null,
          ]),
          budget,
          async (id) => {
            const env = await geo.getLandmarkById!(readCtx, id);
            return env ? landmarkDisplayName(env.data) : null;
          },
        )
      : new Map<string, string | null>();

  return items.map((item) => {
    let driverAssignment = item.driverAssignment;
    if (
      item.driverId &&
      item.driverIdKnowledge === "known" &&
      drivers.has(item.driverId) &&
      drivers.get(item.driverId) == null
    ) {
      driverAssignment = "broken_reference";
    }
    return {
      ...item,
      customerDisplayName: item.customerId
        ? (customers.get(item.customerId) ?? item.customerDisplayName)
        : item.customerDisplayName,
      driverDisplayName: item.driverId
        ? (drivers.get(item.driverId) ?? item.driverDisplayName)
        : item.driverDisplayName,
      pickupLandmarkName: item.pickupLandmarkId
        ? (landmarks.get(item.pickupLandmarkId) ?? item.pickupLandmarkName)
        : item.pickupLandmarkName,
      destinationLandmarkName: item.destinationLandmarkId
        ? (landmarks.get(item.destinationLandmarkId) ??
          item.destinationLandmarkName)
        : item.destinationLandmarkName,
      driverAssignment,
    };
  });
}

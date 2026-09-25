/**
 * Finance party directory — display-name search for accountant filters.
 * Uses Production operational reads (same path as settlement party enrichment).
 * Gated by finance:read only — does not change ROLE_PERMISSION_MATRIX.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { resolveOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";
import { requireCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";

export type FinancePartyDirectoryItem = {
  id: string;
  partyType: "driver" | "agent";
  displayName: string;
  countryId: string | null;
  countryLabel: string | null;
  cityLabel: string | null;
};

function matchesSearch(
  haystack: Array<string | null | undefined>,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((h) => (h ?? "").toLowerCase().includes(needle));
}

export async function listFinancePartyDirectory(
  ctx: ApiActorContext,
  input: {
    partyType: "driver" | "agent";
    search?: string | null;
    countryId?: string | null;
    locale?: "ar" | "en";
    limit?: number;
  },
): Promise<FinancePartyDirectoryItem[]> {
  if (!isProductionOperationalReadArmed()) return [];
  const locale = input.locale === "ar" ? "ar" : "en";
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 50);
  let countryFilter: string | undefined;
  if (input.countryId?.trim()) {
    try {
      countryFilter = requireCanonicalCountryId(input.countryId);
    } catch {
      return [];
    }
  }

  try {
    const runtime = await getProductionOperationalReadRuntime();
    const readCtx = productionReadContextFromActor(ctx);

    if (input.partyType === "driver") {
      const page = await runtime.repos.drivers.list(
        readCtx,
        { countryIds: countryFilter ? [countryFilter] : undefined },
        { limit: Math.min(limit * 2, 50), cursor: null },
      );
      const rows: FinancePartyDirectoryItem[] = [];
      for (const env of page.items) {
        const id = env.data.id;
        const displayName = resolveOperationalDisplayName({
          displayName: env.data.displayName.value,
          id,
        });
        const countryId = env.data.countryId.value;
        const cityId = env.data.cityId.value;
        if (
          !matchesSearch(
            [displayName, id, countryId, cityId],
            input.search ?? "",
          )
        ) {
          continue;
        }
        rows.push({
          id,
          partyType: "driver",
          displayName,
          countryId,
          countryLabel: countryId
            ? resolveCountryDisplayName({ countryId, locale })
            : null,
          cityLabel: cityId ?? null,
        });
        if (rows.length >= limit) break;
      }
      return rows;
    }

    const page = await runtime.repos.agents.list(
      readCtx,
      { countryIds: countryFilter ? [countryFilter] : undefined },
      { limit: Math.min(limit * 2, 50), cursor: null },
    );
    const rows: FinancePartyDirectoryItem[] = [];
    for (const env of page.items) {
      const id = env.data.id;
      const displayName = resolveOperationalDisplayName({
        displayName: env.data.displayName.value,
        id,
      });
      const countryId = env.data.countryId.value;
      if (
        !matchesSearch([displayName, id, countryId], input.search ?? "")
      ) {
        continue;
      }
      rows.push({
        id,
        partyType: "agent",
        displayName,
        countryId,
        countryLabel: countryId
          ? resolveCountryDisplayName({ countryId, locale })
          : null,
        cityLabel: null,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  } catch {
    return [];
  }
}

/** Resolve a single party display name (fail-soft). */
export async function resolveFinancePartyDisplayName(
  ctx: ApiActorContext,
  partyType: "driver" | "agent",
  partyId: string,
): Promise<string | null> {
  if (!partyId || !isProductionOperationalReadArmed()) return null;
  try {
    const runtime = await getProductionOperationalReadRuntime();
    const readCtx = productionReadContextFromActor(ctx);
    if (partyType === "driver") {
      const env = await runtime.repos.drivers.getById(readCtx, partyId);
      if (!env) return null;
      return resolveOperationalDisplayName({
        displayName: env.data.displayName.value,
        id: env.data.id,
      });
    }
    const env = await runtime.repos.agents.getById(readCtx, partyId);
    if (!env) return null;
    return resolveOperationalDisplayName({
      displayName: env.data.displayName.value,
      id: env.data.id,
    });
  } catch {
    return null;
  }
}

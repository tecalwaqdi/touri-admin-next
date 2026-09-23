/**
 * Bounded settlement party display enrichment.
 * Resolves driver/agent names via Production operational reads; fail-soft.
 * Never invents names; never returns raw partyId to clients.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";
import { resolveOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";
import { PRODUCTION_DETAIL_RELATED_READ_LIMIT } from "@/application/production-read/detailScope";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";

export type SettlementPartyRef = {
  settlementId: string;
  partyType: "driver" | "agent";
  partyId: string;
};

async function mapUniquePartyNames(
  refs: SettlementPartyRef[],
  load: (ref: SettlementPartyRef) => Promise<string | null>,
): Promise<Map<string, string | null>> {
  const unique = new Map<string, SettlementPartyRef>();
  for (const ref of refs) {
    const key = `${ref.partyType}:${ref.partyId}`;
    if (!unique.has(key)) unique.set(key, ref);
  }
  const limited = [...unique.values()].slice(
    0,
    PRODUCTION_DETAIL_RELATED_READ_LIMIT,
  );
  const byPartyKey = new Map<string, string | null>();
  await Promise.all(
    limited.map(async (ref) => {
      const key = `${ref.partyType}:${ref.partyId}`;
      try {
        byPartyKey.set(key, await load(ref));
      } catch {
        byPartyKey.set(key, null);
      }
    }),
  );
  const bySettlement = new Map<string, string | null>();
  for (const ref of refs) {
    bySettlement.set(
      ref.settlementId,
      byPartyKey.get(`${ref.partyType}:${ref.partyId}`) ?? null,
    );
  }
  return bySettlement;
}

export async function resolveSettlementPartyDisplayNames(
  ctx: ApiActorContext,
  refs: SettlementPartyRef[],
): Promise<Map<string, string | null>> {
  if (refs.length === 0 || !isProductionOperationalReadArmed()) {
    return new Map(refs.map((r) => [r.settlementId, null]));
  }
  try {
    const runtime = await getProductionOperationalReadRuntime();
    const readCtx = productionReadContextFromActor(ctx);
    return mapUniquePartyNames(refs, async (ref) => {
      if (ref.partyType === "driver") {
        const env = await runtime.repos.drivers.getById(readCtx, ref.partyId);
        if (!env) return null;
        return resolveOperationalDisplayName({
          displayName: env.data.displayName.value,
          id: env.data.id,
        });
      }
      const env = await runtime.repos.agents.getById(readCtx, ref.partyId);
      if (!env) return null;
      return resolveOperationalDisplayName({
        displayName: env.data.displayName.value,
        id: env.data.id,
      });
    });
  } catch {
    return new Map(refs.map((r) => [r.settlementId, null]));
  }
}

export function applySettlementDisplayLabels(
  items: SettlementListItem[],
  partyNames: Map<string, string | null>,
  locale: "ar" | "en" = "en",
): SettlementListItem[] {
  return items.map((item) => ({
    ...item,
    partyLabel: partyNames.get(item.id) ?? item.partyLabel ?? null,
    countryLabel:
      resolveCountryDisplayName({ countryId: item.countryId, locale }) ??
      item.countryLabel ??
      null,
  }));
}

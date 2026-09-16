import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { enforceReadScope } from "@/infrastructure/production/contracts/ScopeExpansionGuard";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";
import { countryIdAllowedByScope } from "./detailScope";
import { mapFinancialPeriodDoc } from "@/application/finance/periods/FinancialPeriodService";

export async function listProductionFinancialPeriods(client: FirestoreReadClient, scope: AccessScope, params: URLSearchParams) {
  const authorized = enforceReadScope({ actorScope: scope });
  if (!authorized.ok) throw new ScopeDeniedError(authorized.reason);
  // Periods have country scope, never infer city or agent ownership.
  if (scope.type === "city" || scope.type === "agent") throw new ScopeDeniedError("Period country scope required");
  const requested = Number(params.get("limit") ?? 20);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.floor(requested))) : 20;
  const page = await client.query({ collection: "financial_periods", limit, orderBy: [{ field: "__name__", direction: "asc" }], startAfterCursor: params.get("cursor") });
  const items = page.docs.filter(d => d.exists && d.data).map(d => mapFinancialPeriodDoc({ id: d.id, data: d.data! }))
    .filter(d => scope.type === "global" || countryIdAllowedByScope(scope.countryIds, d.countryId));
  return { items, nextCursor: page.nextCursor, sourceLabel: "production" as const, accuracy: "bounded_page" as const, synthetic: false };
}

/**
 * Shared helper — catalog APIs use the same WIF-native Firestore client.
 */

import { getProductionOperationalReadRuntime } from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { CatalogReadClient } from "@/application/production-read/P0CatalogApiReads";

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import { scopedCatalogReadClient } from "./ScopedCatalogReadClient";

export async function getCatalogReadClient(actor: ApiActorContext): Promise<CatalogReadClient> {
  const runtime = await getProductionOperationalReadRuntime();
  return scopedCatalogReadClient(runtime.client, actor.user.scope);
}

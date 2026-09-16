/**
 * Shared helper — catalog APIs use the same WIF-native Firestore client.
 */

import { getProductionOperationalReadRuntime } from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { CatalogReadClient } from "@/application/production-read/P0CatalogApiReads";

export async function getCatalogReadClient(): Promise<CatalogReadClient> {
  const runtime = await getProductionOperationalReadRuntime();
  return runtime.client;
}

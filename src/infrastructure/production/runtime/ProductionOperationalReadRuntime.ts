/**
 * Production operational read runtime — ONE shared WIF-native Firestore layer
 * for Trips/Drivers/Customers/Agents/Geography (+ dashboard KPIs).
 * No Firebase Admin ADC. No synthetic fallback.
 */

import { getEnv } from "@/config/env";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import type { ProductionReadRepositories } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { createWifNativeFirestoreRead } from "@/infrastructure/production/firestore/createWifNativeFirestoreReadTransport";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import { productionReadPathActive } from "@/infrastructure/http/shadowApi";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";

export type ProductionOperationalReadRuntime = {
  kind: "wif_native";
  client: FirestoreReadClient;
  credentialKind: "vercel_oidc_wif" | "application_default";
  repos: ProductionReadRepositories;
  liveShadowAllowedResources: ReadonlySet<string>;
  maxReadLimit: typeof WIF_NATIVE_MAX_READ_LIMIT;
};

let runtimePromise: Promise<ProductionOperationalReadRuntime> | null = null;

export function resetProductionOperationalReadRuntimeForTests(): void {
  runtimePromise = null;
}

export function isProductionOperationalReadArmed(): boolean {
  return productionReadPathActive();
}

/**
 * Build ProductionReadContext from verified API actor (RBAC/scope preserved).
 */
export function productionReadContextFromActor(
  ctx: ApiActorContext,
): ProductionReadContext {
  return {
    scope: ctx.user.scope,
    serverScopeFilter: {
      countryIds: ctx.user.scope.countryIds,
      cityIds: ctx.user.scope.cityIds,
      agentIds: ctx.user.scope.agentIds,
    },
    actorUid: ctx.user.id,
    permissions: ctx.user.permissions,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    allowFullPii: false,
  };
}

/**
 * Lazy singleton — WIF-native client + resource repos.
 * Production API path requires WIF (no ADC).
 */
export async function getProductionOperationalReadRuntime(): Promise<ProductionOperationalReadRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const env = getEnv();
    if (!env.PRODUCTION_READ_ENABLED || env.PRODUCTION_READ_MODE !== "shadow") {
      throw new Error("PRODUCTION_READ_DISABLED");
    }
    const projectId = env.EXPECTED_PROJECT_ID?.trim();
    if (!projectId) {
      throw new Error("EXPECTED_PROJECT_ID required for Production operational reads");
    }
    const allowed = parseLiveShadowAllowedResources(
      env.LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    const requireWif =
      env.APP_ENV === "production" || env.APP_ENV === "staging";
    const created = await createWifNativeFirestoreRead({
      projectId,
      requireWif,
    });
    const repos = createProductionReadRepositories({
      client: created.client,
      productionReadEnabled: true,
      fullPiiShadowEnabled: false,
      liveShadowAllowedResources: allowed,
    });
    return {
      kind: "wif_native",
      client: created.client,
      credentialKind: created.kind,
      repos,
      liveShadowAllowedResources: allowed,
      maxReadLimit: WIF_NATIVE_MAX_READ_LIMIT,
    };
  })();
  try {
    return await runtimePromise;
  } catch (err) {
    runtimePromise = null;
    throw err;
  }
}

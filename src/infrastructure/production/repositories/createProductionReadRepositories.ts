/**
 * Phase 4A-0 — wire Production read repositories to a FirestoreReadClient.
 * Default: Fake client. Real Admin client exists but is not activatable without gates.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { IndexCapabilityChecker } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ProductionReadRepositories } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { FirebaseProductionTripReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionTripReadRepository";
import { FirebaseProductionDriverReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionDriverReadRepository";
import { FirebaseProductionAgentReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAgentReadRepository";
import { FirebaseProductionCustomerReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionCustomerReadRepository";
import { FirebaseProductionGeographyReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";

export type CreateProductionReadRepositoriesOptions = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  fullPiiShadowEnabled?: boolean;
  indexChecker?: IndexCapabilityChecker;
  observability?: ProductionReadObservability;
  aliases?: CityAliasEntry[];
  now?: () => Date;
  /** Phase 4A-1 live allowlist; undefined skips resource gate (unit Fake paths). */
  liveShadowAllowedResources?: ReadonlySet<string>;
};

export function createProductionReadRepositories(
  options: CreateProductionReadRepositoriesOptions,
): ProductionReadRepositories {
  const live = options.liveShadowAllowedResources;
  return {
    trips: new FirebaseProductionTripReadRepository({
      client: options.client,
      productionReadEnabled: options.productionReadEnabled,
      indexChecker: options.indexChecker,
      observability: options.observability,
      now: options.now,
      liveShadowAllowedResources: live,
      aliases: options.aliases,
    }),
    drivers: new FirebaseProductionDriverReadRepository({
      client: options.client,
      productionReadEnabled: options.productionReadEnabled,
      observability: options.observability,
      liveShadowAllowedResources: live,
      aliases: options.aliases,
    }),
    agents: new FirebaseProductionAgentReadRepository({
      client: options.client,
      productionReadEnabled: options.productionReadEnabled,
      observability: options.observability,
      liveShadowAllowedResources: live,
      now: options.now,
    }),
    customers: new FirebaseProductionCustomerReadRepository({
      client: options.client,
      productionReadEnabled: options.productionReadEnabled,
      fullPiiShadowEnabled: options.fullPiiShadowEnabled ?? false,
      observability: options.observability,
      liveShadowAllowedResources: live,
      aliases: options.aliases,
    }),
    geography: new FirebaseProductionGeographyReadRepository({
      client: options.client,
      productionReadEnabled: options.productionReadEnabled,
      aliases: options.aliases,
      observability: options.observability,
      liveShadowAllowedResources: live,
    }),
  };
}

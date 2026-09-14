/**
 * Phase 4 DESIGN — Fake Production read repositories (local / tests only).
 * No Firebase. No network. No credentials.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import {
  LEGACY_MAPPING_VERSION,
  SOURCE_SCHEMA_VERSION_UNKNOWN,
  DATA_SOURCE_IDENTITY,
} from "@/domain/production-read/constants";
import { assertProductionReadEnabled } from "@/infrastructure/production/ProductionReadGate";
import { assertCursorPagination } from "@/infrastructure/production/contracts/QuerySafety";
import type {
  ProductionAgentReadRepository,
  ProductionCustomerReadRepository,
  ProductionDriverReadRepository,
  ProductionGeographyReadRepository,
  ProductionReadContext,
  ProductionReadRepositories,
  ProductionTripReadRepository,
  TripListFilter,
  DriverListFilter,
  AgentListFilter,
  CustomerSummaryListFilter,
  GeographyListFilter,
  CanonicalCountryReadModel,
  CanonicalCityReadModel,
  CanonicalLandmarkReadModel,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import { projectCustomerPii } from "@/domain/customer/CanonicalCustomerRead";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import type { Permission } from "@/types/roles";

function emptyPage<T>(): CursorPageResult<T> {
  return { items: [], nextCursor: null, truncated: false };
}

function baseMeta(
  ctx: ProductionReadContext,
  extras?: Partial<ProductionReadEnvelope<unknown>["meta"]>,
): ProductionReadEnvelope<unknown>["meta"] {
  return {
    ...DATA_SOURCE_IDENTITY,
    mappingWarnings: [],
    mappingConfidence: "high",
    mappingVersion: LEGACY_MAPPING_VERSION,
    sourceVersion: null,
    sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
    readSafety: "SAFE",
    blockedFields: [],
    piiRedacted: true,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    ...extras,
  };
}

export type FakeProductionReadOptions = {
  /** Kill switch mirror — default false (matches Production disabled). */
  productionReadEnabled?: boolean;
};

/**
 * Empty fake repos that still enforce kill switch + pagination.
 */
export function createFakeProductionReadRepositories(
  options: FakeProductionReadOptions = {},
): ProductionReadRepositories {
  const enabled = options.productionReadEnabled ?? false;

  const trips: ProductionTripReadRepository = {
    resource: "trips",
    async list(ctx, _filter: TripListFilter, page: CursorPageRequest) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage();
    },
    async getById(ctx, _tripId: string) {
      assertProductionReadEnabled(enabled);
      return null;
    },
  };

  const drivers: ProductionDriverReadRepository = {
    resource: "drivers",
    async list(ctx, _filter: DriverListFilter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage();
    },
    async getById(ctx, _id) {
      assertProductionReadEnabled(enabled);
      return null;
    },
  };

  const agents: ProductionAgentReadRepository = {
    resource: "agents",
    async list(ctx, _filter: AgentListFilter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage();
    },
    async getById(ctx, _id) {
      assertProductionReadEnabled(enabled);
      return null;
    },
  };

  const customers: ProductionCustomerReadRepository = {
    resource: "customers",
    async listSummary(ctx, _filter: CustomerSummaryListFilter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage();
    },
    async getSummaryById(ctx, customerId: string) {
      assertProductionReadEnabled(enabled);
      const permissions = ctx.permissions as Permission[];
      void permissions;
      if (ctx.allowFullPii === true) {
        // Mirror Production trap — full PII still blocked in Fake when callers set allowFullPii
      }
      const mapped = mapCanonicalCustomerFromLegacyDoc({
        documentId: customerId,
        data: {
          uid: customerId,
          display_name: "Customer",
          phone_number: "+966501234567",
          email: "user@example.com",
          actev_user: true,
        },
      });
      const pii = projectCustomerPii(
        { phone: "+966501234567", email: "user@example.com" },
        permissions.includes("customers:read") ||
          permissions.includes("customers:read_pii")
          ? permissions
          : (["customers:read"] as Permission[]),
      );
      const model: CanonicalCustomerReadModel = {
        ...mapped.model,
        phone: {
          ...mapped.model.phone,
          value: pii.phone,
          provenance: {
            ...mapped.model.phone.provenance,
            sourceValue: pii.phone,
            warnings: pii.redacted
              ? [...mapped.model.phone.provenance.warnings, "pii_redacted"]
              : mapped.model.phone.provenance.warnings,
          },
        },
        email: {
          ...mapped.model.email,
          value: pii.email,
          provenance: {
            ...mapped.model.email.provenance,
            sourceValue: pii.email,
            warnings: pii.redacted
              ? [...mapped.model.email.provenance.warnings, "pii_redacted"]
              : mapped.model.email.provenance.warnings,
          },
        },
        countryId: {
          ...mapped.model.countryId,
          value: ctx.serverScopeFilter.countryIds?.[0] ?? mapped.model.countryId.value,
        },
      };

      const envelope: ProductionReadEnvelope<CanonicalCustomerReadModel> = {
        data: model,
        meta: baseMeta(ctx, {
          piiRedacted: true,
          mappingWarnings: [
            {
              code: "pii_redacted",
              message: "PII masked by default",
              severity: "info",
            },
          ],
          readSafety: "REDACTED",
        }),
      };
      return envelope;
    },
  };

  const geography: ProductionGeographyReadRepository = {
    resource: "geography",
    async listCountries(ctx, _filter: GeographyListFilter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage<ProductionReadEnvelope<CanonicalCountryReadModel>>();
    },
    async listCities(ctx, _filter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage<ProductionReadEnvelope<CanonicalCityReadModel>>();
    },
    async listLandmarks(ctx, _filter, page) {
      assertProductionReadEnabled(enabled);
      assertCursorPagination(page);
      return emptyPage<ProductionReadEnvelope<CanonicalLandmarkReadModel>>();
    },
  };

  // silence unused in empty stubs that still need ctx for signature
  void (trips as ProductionTripReadRepository);
  void (drivers as { getById: typeof drivers.getById });

  return { trips, drivers, agents, customers, geography };
}

/** Helper for tests that need a typed empty trip envelope factory. */
export function fakeTripEnvelope(
  ctx: ProductionReadContext,
  model: CanonicalTripReadModel,
): ProductionReadEnvelope<CanonicalTripReadModel> {
  return { data: model, meta: baseMeta(ctx) };
}

export function fakeDriverEnvelope(
  ctx: ProductionReadContext,
  model: CanonicalDriverReadModel,
): ProductionReadEnvelope<CanonicalDriverReadModel> {
  return { data: model, meta: baseMeta(ctx) };
}

export function fakeAgentEnvelope(
  ctx: ProductionReadContext,
  model: CanonicalAgentReadModel,
): ProductionReadEnvelope<CanonicalAgentReadModel> {
  return { data: model, meta: baseMeta(ctx) };
}

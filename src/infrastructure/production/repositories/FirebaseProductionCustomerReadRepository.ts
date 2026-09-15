/**
 * Phase 4A-7 — FirebaseProductionCustomerReadRepository.
 * Authoritative collection: Legacy Firestore `user` with exclusionary membership
 * (adminIsAppCustomer: !Isagent && !ismndob && !ismndom) + contamination gate.
 *
 * Query: NO invented is_customer filter. orderBy FieldPath.documentId() (__name__) asc,
 * cursor, limit≤50. created_time NOT used for pagination (4A-6 index lesson).
 * Country scope applied post-map (Rev_dolh is DocumentReference).
 * No N+1 order / Auth Admin / address lookups.
 * No create / activate / suspend / delete / wallet writes.
 * FULL_PII_SHADOW_ENABLED=false — masked contact hints only.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  CustomerSummaryListFilter,
  ProductionCustomerReadRepository,
  ProductionReadContext,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DefaultLegacyCustomerSummaryMapper } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  assertPageLimit,
  envelopeOf,
  enforceKillSwitch,
  enforceLiveShadowResource,
  FullPiiShadowDisabledError,
  intersectScopeOrThrow,
  isCountryInScopedList,
  ScopeDeniedError,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import { SOURCE_SCHEMA_VERSION_UNKNOWN } from "@/domain/production-read/constants";
import type { ProductionCustomerSummarySourceRecord } from "@/infrastructure/production/contracts/ProductionSourceRecords";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import {
  auditCustomerDuplicates,
  hashCustomerEmailForAudit,
  hashCustomerPhoneForAudit,
  rowFromCanonicalCustomer,
  type CustomerDuplicateAuditMetrics,
} from "@/domain/customer/CustomerDuplicateIdentityAudit";
import {
  selectCustomerDiagnosticsForLiveSummary,
  type CustomerMappingDiagnostic,
} from "@/domain/customer/CustomerMappingDiagnostic";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import type { Permission } from "@/types/roles";

/** Phase 4A-7 hard cap — operator live window max page. */
export const PHASE_4A7_CUSTOMERS_MAX_PAGE = 50;

/**
 * @deprecated Phase 4A-7 — created_time must NOT drive Customer list orderBy.
 * Kept so docs/tests can reference the forbidden field explicitly.
 */
export const PHASE_4A7_CUSTOMER_TIMESTAMP_FIELD = "created_time" as const;

/**
 * Index-free pagination order field — Admin SDK FieldPath.documentId() / `__name__`.
 * No positive equality discriminator exists for customers (exclusionary membership).
 */
export const PHASE_4A7_CUSTOMER_ORDER_FIELD = "__name__" as const;

/**
 * Membership is exclusionary post-map — there is no Firestore equality field.
 * Documented sentinel for queryMeta (not a real filter field).
 */
export const PHASE_4A7_CUSTOMER_DISCRIMINATOR_KIND =
  "exclusionary_non_driver_non_agent" as const;

export type CustomerQueryMeta = {
  queryTimestampField: typeof PHASE_4A7_CUSTOMER_ORDER_FIELD;
  queryOrderDirection: "asc";
  queryLimit: number;
  discriminatorKind: typeof PHASE_4A7_CUSTOMER_DISCRIMINATOR_KIND;
  /** Always false — no invented is_customer Firestore filter. */
  positiveEqualityFilterApplied: false;
};

export type FirebaseProductionCustomerReadRepositoryDeps = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  /** Must remain false in 4A-7 — trap even if role has customers:read_pii. */
  fullPiiShadowEnabled?: boolean;
  observability?: ProductionReadObservability;
  liveShadowAllowedResources?: ReadonlySet<string>;
  aliases?: CityAliasEntry[];
};

export type CustomerListPageResult =
  CursorPageResult<ProductionReadEnvelope<CanonicalCustomerReadModel>> & {
    auditMetrics: CustomerDuplicateAuditMetrics;
    queryMeta: CustomerQueryMeta;
    customerMappingDiagnostics: CustomerMappingDiagnostic[];
  };

export class FirebaseProductionCustomerReadRepository
  implements ProductionCustomerReadRepository
{
  readonly resource = "customers" as const;
  private readonly mapper = new DefaultLegacyCustomerSummaryMapper();
  private readonly fullPiiShadowEnabled: boolean;

  constructor(
    private readonly deps: FirebaseProductionCustomerReadRepositoryDeps,
  ) {
    this.fullPiiShadowEnabled = deps.fullPiiShadowEnabled ?? false;
  }

  async listSummary(
    ctx: ProductionReadContext,
    filter: CustomerSummaryListFilter,
    page: CursorPageRequest,
  ): Promise<CustomerListPageResult> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "customers");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "customers",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryIds,
      cityIds: filter.cityIds,
    });

    const normalizedPage = assertPageLimit(page);
    if (normalizedPage.limit > PHASE_4A7_CUSTOMERS_MAX_PAGE) {
      throw new QuerySafetyError(
        `Customer page limit ${normalizedPage.limit} exceeds PHASE_4A7_CUSTOMERS_MAX_PAGE=${PHASE_4A7_CUSTOMERS_MAX_PAGE}`,
      );
    }

    // Index-free list: collection user; orderBy FieldPath.documentId() asc.
    // NO invented is_customer / is_app_user equality filter (does not exist in Legacy).
    // created_time removed — avoids composite index + silent exclusion (4A-6 lesson).
    // Country DocumentReference filter deferred — post-map scope (optional like Trips).
    // Membership + contamination applied in mapper → excludedNonCustomer partition.
    const result = await this.deps.client.query({
      collection: "user",
      filters: [],
      orderBy: [{ field: PHASE_4A7_CUSTOMER_ORDER_FIELD, direction: "asc" }],
      limit: Math.min(normalizedPage.limit, PHASE_4A7_CUSTOMERS_MAX_PAGE),
      startAfterCursor: normalizedPage.cursor,
    });

    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => this.mapDoc(ctx, d.id, d.data!));

    if (scoped.countryIds?.length) {
      items = items.filter((e) => {
        // Optional country policy: docs without country fall outside scoped lists
        // (geographyNotRepresented remains visible on unscoped global reads).
        const c = e.data.countryId.value;
        return c != null && scoped.countryIds!.includes(c);
      });
    }
    if (scoped.cityIds?.length) {
      items = items.filter((e) => {
        const c = e.data.cityId.value;
        return c != null && scoped.cityIds!.includes(c);
      });
    }

    // Audit hashes from hints are useless — phoneHash left null in list
    // (raw never available on model). Collisions audited only when hash provided.
    void hashCustomerPhoneForAudit;
    void hashCustomerEmailForAudit;

    const auditRows = items.map((e) =>
      rowFromCanonicalCustomer(e.data, { phoneHash: null, emailHash: null }),
    );
    const auditMetrics = auditCustomerDuplicates(auditRows, {
      unexpectedCollections: 0,
    });
    const customerMappingDiagnostics = selectCustomerDiagnosticsForLiveSummary(
      items.map((e) => e.data),
    );

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
      auditMetrics,
      customerMappingDiagnostics,
      queryMeta: {
        queryTimestampField: PHASE_4A7_CUSTOMER_ORDER_FIELD,
        queryOrderDirection: "asc",
        queryLimit: Math.min(
          normalizedPage.limit,
          PHASE_4A7_CUSTOMERS_MAX_PAGE,
        ),
        discriminatorKind: PHASE_4A7_CUSTOMER_DISCRIMINATOR_KIND,
        positiveEqualityFilterApplied: false,
      },
    };
  }

  async getSummaryById(
    ctx: ProductionReadContext,
    customerId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCustomerReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "customers");
    const scoped = intersectScopeOrThrow(ctx, {});
    const snap = await this.deps.client.getDocument("user", customerId);
    if (!snap.exists || !snap.data) return null;

    const mapped = this.mapDoc(ctx, snap.id, snap.data);

    // Shared collection: non-operational rows still return envelope with
    // excludedNonCustomer / excludedUnknownIdentity for diagnostics.

    const countryId = mapped.data.countryId.value;
    if (
      scoped.countryIds?.length &&
      !isCountryInScopedList(scoped.countryIds, countryId)
    ) {
      throw new ScopeDeniedError("customer outside authorized country scope");
    }
    return mapped;
  }

  private mapDoc(
    ctx: ProductionReadContext,
    id: string,
    data: Record<string, unknown>,
  ): ProductionReadEnvelope<CanonicalCustomerReadModel> {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: id,
      data,
      aliases: this.deps.aliases,
    });
    void this.mapper;

    const permissions = ctx.permissions as Permission[];
    const wantsFullPii =
      ctx.allowFullPii === true ||
      permissions.includes("customers:read_pii");

    if (wantsFullPii && !this.fullPiiShadowEnabled) {
      this.deps.observability?.emit({
        type: "production_read_denied",
        reason: "FULL_PII_SHADOW_ENABLED=false",
        code: "FULL_PII_SHADOW_DISABLED",
      });
      if (ctx.allowFullPii === true) {
        throw new FullPiiShadowDisabledError();
      }
    }

    // Model already carries masked hints only — never re-inject raw from source.
    this.deps.observability?.emit({
      type: "pii_redacted",
      resource: "customers",
      fieldCount: 2,
    });

    const source: ProductionCustomerSummarySourceRecord = {
      resource: "customer_summary",
      sourceCollection: "user",
      sourceDocumentId: id,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: data,
    };
    void source;

    return envelopeOf(ctx, mapped.model, {
      mappingWarnings: [
        ...mapped.mappingWarnings,
        {
          code: "pii_redacted",
          message: "Customer contact fields are masked hints only",
          severity: "info" as const,
        },
      ],
      mappingConfidence: mapped.mappingConfidence,
      blockedFields: [
        "phone_number",
        "phone_n",
        "email",
        "photo_url",
        "address",
        "adresslist",
        "fcm_token",
        "password",
        "iban",
        "bankIdAcc",
      ],
      piiRedacted: true,
      readSafety: "REDACTED",
    });
  }
}

/**
 * Phase 4A-6 — FirebaseProductionAgentReadRepository.
 * Authoritative collection: Legacy Firestore `user` with discriminator `Isagent==true`.
 * Query: Isagent==true, orderBy FieldPath.documentId() (__name__) asc, cursor, limit≤50.
 * created_time is NOT used for pagination (avoids composite index + silent exclusion).
 * Country scope applied post-map (Rev_dloh_agent is DocumentReference).
 * No N+1 agent_country_assignment / Auth Admin lookups.
 * No create / activate / disable / reassign / commission writes.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  AgentListFilter,
  ProductionAgentReadRepository,
  ProductionReadContext,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DefaultLegacyAgentMapper } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  assertPageLimit,
  envelopeOf,
  enforceKillSwitch,
  enforceLiveShadowResource,
  intersectScopeOrThrow,
  ScopeDeniedError,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import { SOURCE_SCHEMA_VERSION_UNKNOWN } from "@/domain/production-read/constants";
import type { ProductionAgentSourceRecord } from "@/infrastructure/production/contracts/ProductionSourceRecords";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { mapCanonicalAgentFromLegacyDoc } from "@/domain/agent/mapCanonicalAgentRead";
import {
  auditAgentDuplicates,
  hashAgentPhoneForAudit,
  rowFromCanonicalAgent,
  type AgentDuplicateAuditMetrics,
} from "@/domain/agent/AgentDuplicateIdentityAudit";
import {
  selectAgentDiagnosticsForLiveSummary,
  type AgentMappingDiagnostic,
} from "@/domain/agent/AgentMappingDiagnostic";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";

/** Phase 4A-6 hard cap — operator live window max page. */
export const PHASE_4A6_AGENTS_MAX_PAGE = 50;

/**
 * @deprecated Phase 4A-6 index fix — created_time must NOT drive Agent list orderBy.
 * Kept as named constant only so older tests/docs can reference the removed field.
 */
export const PHASE_4A6_AGENT_TIMESTAMP_FIELD = "created_time" as const;

/**
 * Index-free pagination order field — Admin SDK FieldPath.documentId() / `__name__`.
 * Equality on Isagent + orderBy documentId uses automatic single-field indexing.
 */
export const PHASE_4A6_AGENT_ORDER_FIELD = "__name__" as const;

/** Primary Firestore discriminator (Admin dashboard + agent_country_assignment). */
export const PHASE_4A6_AGENT_DISCRIMINATOR_FIELD = "Isagent" as const;

export type AgentQueryMeta = {
  /** Order field actually used by the Production query (documentId / __name__). */
  queryTimestampField: typeof PHASE_4A6_AGENT_ORDER_FIELD;
  queryOrderDirection: "asc";
  queryLimit: number;
  discriminatorField: typeof PHASE_4A6_AGENT_DISCRIMINATOR_FIELD;
  discriminatorValue: true;
};

export type FirebaseProductionAgentReadRepositoryDeps = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  observability?: ProductionReadObservability;
  liveShadowAllowedResources?: ReadonlySet<string>;
  now?: () => Date;
};

export type AgentListPageResult =
  CursorPageResult<ProductionReadEnvelope<CanonicalAgentReadModel>> & {
    auditMetrics: AgentDuplicateAuditMetrics;
    queryMeta: AgentQueryMeta;
    /** Safe mapping diagnostics for live summary (no PII). */
    agentMappingDiagnostics: AgentMappingDiagnostic[];
  };

export class FirebaseProductionAgentReadRepository
  implements ProductionAgentReadRepository
{
  readonly resource = "agents" as const;
  private readonly mapper = new DefaultLegacyAgentMapper();

  constructor(private readonly deps: FirebaseProductionAgentReadRepositoryDeps) {}

  async list(
    ctx: ProductionReadContext,
    filter: AgentListFilter,
    page: CursorPageRequest,
  ): Promise<AgentListPageResult> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "agents");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "agents",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryIds,
    });

    // Agent actors are 1:1 — cannot list other agents
    if (ctx.scope.type === "agent" && ctx.scope.agentIds?.length) {
      const selfId = ctx.scope.agentIds[0]!;
      const self = await this.getById(ctx, selfId);
      const items = self ? [self] : [];
      const auditRows = items.map((e) =>
        rowFromCanonicalAgent(e.data, { phoneHash: null }),
      );
      return {
        items,
        nextCursor: null,
        truncated: false,
        auditMetrics: auditAgentDuplicates(auditRows),
        agentMappingDiagnostics: selectAgentDiagnosticsForLiveSummary(
          items.map((e) => e.data),
        ),
        queryMeta: {
          queryTimestampField: PHASE_4A6_AGENT_ORDER_FIELD,
          queryOrderDirection: "asc",
          queryLimit: 1,
          discriminatorField: "Isagent",
          discriminatorValue: true,
        },
      };
    }

    const normalizedPage = assertPageLimit(page);
    if (normalizedPage.limit > PHASE_4A6_AGENTS_MAX_PAGE) {
      throw new QuerySafetyError(
        `Agent page limit ${normalizedPage.limit} exceeds PHASE_4A6_AGENTS_MAX_PAGE=${PHASE_4A6_AGENTS_MAX_PAGE}`,
      );
    }

    // Index-free list: where Isagent==true; orderBy FieldPath.documentId() asc.
    // created_time removed — not identity; old Agents may lack it; composite index forbidden.
    // Country DocumentReference filter deferred — post-map scope.
    // Single Production query on Isagent (writers persist capitalized Isagent; see alias report).
    const result = await this.deps.client.query({
      collection: "user",
      filters: [
        {
          field: PHASE_4A6_AGENT_DISCRIMINATOR_FIELD,
          op: "==",
          value: true,
        },
      ],
      orderBy: [{ field: PHASE_4A6_AGENT_ORDER_FIELD, direction: "asc" }],
      limit: Math.min(normalizedPage.limit, PHASE_4A6_AGENTS_MAX_PAGE),
      startAfterCursor: normalizedPage.cursor,
    });

    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => this.mapDoc(ctx, d.id, d.data!));

    if (scoped.countryIds?.length) {
      items = items.filter((e) => {
        const c = e.data.countryId.value;
        return c != null && scoped.countryIds!.includes(c);
      });
    }

    const auditRows = items.map((e) =>
      rowFromCanonicalAgent(e.data, { phoneHash: null }),
    );
    void hashAgentPhoneForAudit;

    const auditMetrics = auditAgentDuplicates(auditRows, {
      unexpectedCollections: 0,
    });
    const agentMappingDiagnostics = selectAgentDiagnosticsForLiveSummary(
      items.map((e) => e.data),
    );

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
      auditMetrics,
      agentMappingDiagnostics,
      queryMeta: {
        queryTimestampField: PHASE_4A6_AGENT_ORDER_FIELD,
        queryOrderDirection: "asc",
        queryLimit: Math.min(normalizedPage.limit, PHASE_4A6_AGENTS_MAX_PAGE),
        discriminatorField: "Isagent",
        discriminatorValue: true,
      },
    };
  }

  async getById(
    ctx: ProductionReadContext,
    agentId: string,
  ): Promise<ProductionReadEnvelope<CanonicalAgentReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "agents");
    const scoped = intersectScopeOrThrow(ctx, {
      agentIds: ctx.scope.type === "agent" ? [agentId] : undefined,
    });
    if (
      scoped.agentIds?.length &&
      !scoped.agentIds.includes(agentId)
    ) {
      throw new ScopeDeniedError("agent cannot access another agent");
    }
    const snap = await this.deps.client.getDocument("user", agentId);
    if (!snap.exists || !snap.data) return null;

    // Reject non-agent docs (shared user collection).
    if (snap.data.Isagent !== true && snap.data.isagent !== true) {
      return null;
    }

    const mapped = this.mapDoc(ctx, snap.id, snap.data);
    const countryId = mapped.data.countryId.value;
    if (
      scoped.countryIds?.length &&
      countryId &&
      !scoped.countryIds.includes(countryId)
    ) {
      throw new ScopeDeniedError("agent outside authorized country scope");
    }
    return mapped;
  }

  private mapDoc(
    ctx: ProductionReadContext,
    id: string,
    data: Record<string, unknown>,
  ): ProductionReadEnvelope<CanonicalAgentReadModel> {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: id,
      data,
      now: this.deps.now?.(),
    });
    void this.mapper;

    const source: ProductionAgentSourceRecord = {
      resource: "agent",
      sourceCollection: "user",
      sourceDocumentId: id,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: data,
    };
    void source;

    return envelopeOf(ctx, mapped.model, {
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      blockedFields: [
        "phone_number",
        "phone_n",
        "email",
        "photo_url",
        "agent_geo_center",
        "agent_bounds_sw",
        "agent_bounds_ne",
        "password",
      ],
      piiRedacted: true,
      readSafety: "REDACTED",
    });
  }
}

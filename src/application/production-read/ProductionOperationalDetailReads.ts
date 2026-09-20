/**
 * PC-2 — Production operational detail reads (WIF-native getById).
 * Exact document get + narrowly bounded related reads (≤20). No write RPCs.
 */

import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  assertDetailResourceInScope,
  PRODUCTION_DETAIL_RELATED_READ_LIMIT,
} from "@/application/production-read/detailScope";
import {
  ProductionDetailNotFoundError,
  type AgentDetailDto,
  type AgentFinanceSummaryDto,
  type CustomerDetailDto,
  type DriverDetailDto,
  type DriverFinanceSummaryDto,
  type DriverTripSummaryDto,
  type TripDetailDto,
} from "@/application/production-read/detailDtos";
import {
  agentCountryBucket,
  baseMeta,
  buildAgentDetailWarnings,
  mapCanonicalCustomerToDetail,
  mapCanonicalDriverToDetail,
  mapCanonicalTripToDetail,
} from "@/application/production-read/mapCanonicalToDetailDtos";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import {
  getFinanceReportingReadService,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { diagnoseDuplicateActiveAgents } from "@/domain/geography/GeographyPresentation";
import { resolveOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";

function landmarkDisplayName(input: {
  safeName?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
}): string | null {
  const ar = input.nameAr?.trim() || null;
  const en = input.nameEn?.trim() || null;
  const safe = input.safeName?.trim() || null;
  return ar ?? en ?? safe ?? null;
}

async function enrichTripDetailPartiesAndRoute(
  ctx: ApiActorContext,
  dto: TripDetailDto,
): Promise<TripDetailDto> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  let related = 0;
  let customerDisplayName = dto.customerDisplayName;
  let driverDisplayName = dto.driverDisplayName;
  let agentDisplayName = dto.agentDisplayName;
  let pickupLandmarkName = dto.pickupLandmarkName;
  let destinationLandmarkName = dto.destinationLandmarkName;
  let driverAssignment = dto.driverAssignment;

  if (
    dto.customerId &&
    dto.customerIdKnowledge === "known" &&
    related < PRODUCTION_DETAIL_RELATED_READ_LIMIT
  ) {
    related += 1;
    try {
      const env = await runtime.repos.customers.getSummaryById(
        readCtx,
        dto.customerId,
      );
      if (env) {
        customerDisplayName = resolveOperationalDisplayName({
          displayName: env.data.displayName.value,
          emailHint: env.data.emailHint?.value ?? env.data.email?.value,
          phoneHint: env.data.phoneHint?.value ?? env.data.phone?.value,
          id: env.data.id,
        });
      }
    } catch {
      // non-blocking enrichment
    }
  }

  if (
    dto.driverId &&
    dto.driverIdKnowledge === "known" &&
    related < PRODUCTION_DETAIL_RELATED_READ_LIMIT
  ) {
    related += 1;
    try {
      const env = await runtime.repos.drivers.getById(readCtx, dto.driverId);
      if (env) {
        driverDisplayName = resolveOperationalDisplayName({
          displayName: env.data.displayName.value,
          id: env.data.id,
        });
      } else {
        driverAssignment = "broken_reference";
      }
    } catch {
      driverAssignment = "broken_reference";
    }
  }

  if (
    dto.agentId &&
    related < PRODUCTION_DETAIL_RELATED_READ_LIMIT
  ) {
    related += 1;
    try {
      const env = await runtime.repos.agents.getById(readCtx, dto.agentId);
      if (env) {
        agentDisplayName = resolveOperationalDisplayName({
          displayName: env.data.displayName.value,
          id: env.data.id,
        });
      }
    } catch {
      // non-blocking
    }
  }

  const geo = runtime.repos.geography;
  if (
    dto.pickupLandmarkId &&
    dto.pickupLandmarkKnowledge === "known" &&
    typeof geo.getLandmarkById === "function" &&
    related < PRODUCTION_DETAIL_RELATED_READ_LIMIT
  ) {
    related += 1;
    try {
      const env = await geo.getLandmarkById(readCtx, dto.pickupLandmarkId);
      if (env) {
        pickupLandmarkName = landmarkDisplayName(env.data);
      }
    } catch {
      // non-blocking
    }
  }

  if (
    dto.destinationLandmarkId &&
    dto.destinationLandmarkKnowledge === "known" &&
    typeof geo.getLandmarkById === "function" &&
    related < PRODUCTION_DETAIL_RELATED_READ_LIMIT
  ) {
    related += 1;
    try {
      const env = await geo.getLandmarkById(
        readCtx,
        dto.destinationLandmarkId,
      );
      if (env) {
        destinationLandmarkName = landmarkDisplayName(env.data);
      }
    } catch {
      // non-blocking
    }
  }

  return {
    ...dto,
    customerDisplayName,
    driverDisplayName,
    agentDisplayName,
    pickupLandmarkName,
    destinationLandmarkName,
    driverAssignment,
  };
}

export async function getProductionTripDetailApi(
  ctx: ApiActorContext,
  tripId: string,
): Promise<TripDetailDto> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const envelope = await runtime.repos.trips.getById(readCtx, tripId);
  if (!envelope) {
    throw new ProductionDetailNotFoundError("trip", tripId);
  }
  const dto = mapCanonicalTripToDetail(envelope.data);
  assertDetailResourceInScope(ctx.user.scope, {
    countryId: dto.countryId ?? dto.canonicalCountryId,
    agentId: dto.agentId,
    cityId: dto.cityId,
  });
  const enriched = await enrichTripDetailPartiesAndRoute(ctx, dto);
  return {
    ...enriched,
    piiRedacted: envelope.meta.piiRedacted ?? true,
  };
}

async function loadDriverFinanceAndTripSummary(input: {
  ctx: ApiActorContext;
  driverId: string;
  countryId: string | null;
}): Promise<{
  finance: DriverFinanceSummaryDto | null;
  tripSummary: DriverTripSummaryDto | null;
}> {
  /**
   * Trip list repo has no driverId filter — cannot fabricate trip counts.
   * True empty / unavailable until an authoritative by-driver trip aggregate exists.
   */
  const tripSummary: DriverTripSummaryDto = {
    availability: "unavailable",
    total: null,
    completed: null,
    cancelled: null,
    current: null,
    source: "none",
  };
  if (!input.ctx.user.permissions.includes("finance:read")) {
    return { finance: null, tripSummary };
  }
  try {
    const service = await getFinanceReportingReadService();
    const actor = toFinanceReportingActor(input.ctx);
    const summary = service.driverSummary(actor, input.driverId, {
      countryId: input.countryId,
    });
    const finance: DriverFinanceSummaryDto = {
      availability: "available",
      currencyCode: summary.meta.currency,
      grossEarnings: summary.metrics.grossEarnings,
      commission: summary.metrics.commission,
      vat: summary.metrics.vat,
      driverNet: summary.metrics.driverNet,
      settledAmount: summary.metrics.settledAmount,
      outstandingAmount: summary.metrics.outstandingAmount,
    };
    return { finance, tripSummary };
  } catch {
    return {
      finance: {
        availability: "unavailable",
        currencyCode: null,
        grossEarnings: null,
        commission: null,
        vat: null,
        driverNet: null,
        settledAmount: null,
        outstandingAmount: null,
      },
      tripSummary,
    };
  }
}

export async function getProductionDriverDetailApi(
  ctx: ApiActorContext,
  driverId: string,
): Promise<DriverDetailDto> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const envelope = await runtime.repos.drivers.getById(readCtx, driverId);
  if (!envelope) {
    throw new ProductionDetailNotFoundError("driver", driverId);
  }
  const dto = mapCanonicalDriverToDetail(envelope.data);
  assertDetailResourceInScope(ctx.user.scope, {
    countryId: dto.countryId,
  });
  const { finance, tripSummary } = await loadDriverFinanceAndTripSummary({
    ctx,
    driverId,
    countryId: dto.countryId,
  });
  return {
    ...dto,
    financial: {
      ...dto.financial,
      summary: finance,
    },
    tripSummary,
    piiRedacted: envelope.meta.piiRedacted ?? true,
  };
}

export async function getProductionCustomerDetailApi(
  ctx: ApiActorContext,
  customerId: string,
): Promise<CustomerDetailDto> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const envelope = await runtime.repos.customers.getSummaryById(
    readCtx,
    customerId,
  );
  if (!envelope) {
    throw new ProductionDetailNotFoundError("customer", customerId);
  }
  // Shared user collection: excluded personas are treated as not found for product detail.
  if (
    envelope.data.mappingStatus === "excludedNonCustomer" ||
    envelope.data.mappingStatus === "excludedUnknownIdentity" ||
    envelope.data.isOperationalCustomer === false
  ) {
    throw new ProductionDetailNotFoundError("customer", customerId);
  }
  const dto = mapCanonicalCustomerToDetail(envelope.data);
  assertDetailResourceInScope(ctx.user.scope, {
    countryId: dto.countryId,
    cityId: dto.cityId,
  });
  return {
    ...dto,
    piiRedacted: envelope.meta.piiRedacted ?? true,
  };
}

async function loadAgentFinanceSummary(input: {
  ctx: ApiActorContext;
  agentId: string;
  countryId: string | null;
}): Promise<AgentFinanceSummaryDto> {
  const unavailable: AgentFinanceSummaryDto = {
    availability: "unavailable",
    collectedCash: null,
    outstanding: null,
    paid: null,
    currencyCode: null,
    attributionStatus: null,
  };
  if (!input.countryId) return unavailable;
  if (!input.ctx.user.permissions.includes("finance:read")) {
    return unavailable;
  }
  try {
    const service = await getFinanceReportingReadService();
    const summary = service.agentSummary(
      toFinanceReportingActor(input.ctx),
      { agentId: input.agentId, countryId: input.countryId },
      {},
    );
    return {
      availability: "available",
      collectedCash: summary.metrics.collectedCash ?? null,
      outstanding: summary.metrics.outstanding ?? null,
      paid: summary.metrics.paid ?? null,
      currencyCode:
        summary.metrics.collectedCash?.currency ??
        summary.metrics.outstanding?.currency ??
        null,
      attributionStatus: summary.metrics.attributionStatus ?? null,
    };
  } catch {
    return unavailable;
  }
}

export async function getProductionAgentDetailApi(
  ctx: ApiActorContext,
  agentId: string,
): Promise<AgentDetailDto> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const envelope = await runtime.repos.agents.getById(readCtx, agentId);
  if (!envelope) {
    throw new ProductionDetailNotFoundError("agent", agentId);
  }
  const model = envelope.data;
  assertDetailResourceInScope(ctx.user.scope, {
    countryId: model.countryId.value,
    agentId: model.id,
  });

  const warnings = buildAgentDetailWarnings(model);
  const countryId = model.countryId.value;
  const canonicalCountryId = tryCanonicalCountryId(countryId);
  const bucket = agentCountryBucket(countryId);

  // Bounded peer read for one-country-one-active-agent invariant (≤20).
  let countryInvariant: AgentDetailDto["countryInvariant"] = "unknown";
  const activePeerAgentIds: string[] = [];
  if (countryId) {
    const peers = await runtime.repos.agents.list(
      readCtx,
      { countryIds: [countryId] },
      { limit: PRODUCTION_DETAIL_RELATED_READ_LIMIT, cursor: null },
    );
    const active = peers.items
      .map((e) => e.data)
      .filter((a) => a.isOperationallyActive);
    for (const a of active) activePeerAgentIds.push(a.id);
    const dup = diagnoseDuplicateActiveAgents(active.length);
    if (dup) warnings.push(dup);
    if (active.length > 1) countryInvariant = "fail_multiple_active";
    else if (active.length === 1) countryInvariant = "pass";
    else countryInvariant = "no_active_agent";
  }

  const finance = await loadAgentFinanceSummary({
    ctx,
    agentId,
    countryId,
  });

  // FR7 settlements — in-memory from finance service when finance:read; cap ≤20.
  const settlements: AgentDetailDto["settlements"] = [];
  if (
    countryId &&
    ctx.user.permissions.includes("finance:read")
  ) {
    try {
      const service = await getFinanceReportingReadService();
      const rows = service.settlements(toFinanceReportingActor(ctx), {
        countryId,
        agentId,
      });
      for (const row of rows.slice(0, PRODUCTION_DETAIL_RELATED_READ_LIMIT)) {
        settlements.push({
          id: row.id,
          status: row.status,
          countryId: row.countryId ?? null,
        });
      }
    } catch {
      // non-blocking — finance already marked unavailable when summary fails
    }
  }

  const status: AgentDetailDto["status"] = model.isOperationallyActive
    ? "active"
    : model.operationalActiveState === "unknown"
      ? "unknown"
      : "inactive";

  return {
    kind: "agent",
    ...baseMeta(model.id, model.mappingStatus, warnings, true),
    id: model.id,
    canonicalAgentId: model.canonicalAgentId,
    displayName: model.displayName.value,
    email: null,
    phone: null,
    countryId,
    canonicalCountryId,
    countryBucket: bucket,
    status,
    operationalActiveState: model.operationalActiveState,
    accountState: model.accountState,
    createdAtUtc: model.createdAtUtc,
    updatedAtUtc: null,
    activeFromUtc: model.activeFromUtc,
    activeToUtc: model.activeToUtc,
    countryInvariant,
    activePeerAgentIds,
    relatedReadsBounded: true,
    relatedReadLimit: PRODUCTION_DETAIL_RELATED_READ_LIMIT,
    finance,
    settlements,
    mappingStatus: model.mappingStatus,
    incompleteReasons: [...(model.incompleteReasons ?? [])],
    statusWarnings: [...(model.statusWarnings ?? [])],
    piiRedacted: envelope.meta.piiRedacted ?? true,
  };
}

export { PRODUCTION_DETAIL_RELATED_READ_LIMIT };

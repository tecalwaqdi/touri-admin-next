/**
 * F2 — Production Finance **read** adapter (order majors + V2 settlements).
 * No writes. Maps Legacy documents into Admin Next Finance DTOs / snapshots.
 * Missing ≠ 0. Never invents rates. Never attributes current country agent historically.
 */

import {
  buildTripFinancialSnapshot,
  majorToMinor,
  type TripFinancialSnapshot,
} from "@/domain/finance/v2/TripFinancialSnapshot";
import {
  buildAgentAccountingLine,
  buildDriverAccountingLine,
  type AccountingLine,
} from "@/domain/finance/v2/AccountingLine";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import type {
  SettlementDirection,
  SettlementPartyType,
  SettlementV2Status,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import { FinanceReadService } from "@/application/finance/FinanceReadService";
import { resolveTripPayment } from "@/domain/trip/TripPaymentModels";
import { resolveTripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import { assertProductionFinanceRejectsRegistryInput } from "@/application/finance/pilot/FinanceFr1RegistryPilotGate";

const V2_STATUS_SET = new Set([
  "draft",
  "locked",
  "partially_paid",
  "settled",
  "voided",
]);

function asRecord(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function readMajorMinor(
  data: Record<string, unknown>,
  field: string,
): bigint | null {
  if (!Object.prototype.hasOwnProperty.call(data, field)) return null;
  const v = data[field];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return majorToMinor(v);
  }
  if (typeof v === "bigint") return v;
  return null;
}

function refPathId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim()) {
    const parts = value.trim().split("/");
    return parts[parts.length - 1] || value.trim();
  }
  if (typeof value === "object" && value !== null) {
    const path =
      typeof (value as { path?: unknown }).path === "string"
        ? (value as { path: string }).path
        : null;
    if (path && path.trim()) {
      const parts = path.trim().split("/");
      return parts[parts.length - 1] || path.trim();
    }
  }
  return null;
}

function refFullPath(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "object" && value !== null) {
    const path =
      typeof (value as { path?: unknown }).path === "string"
        ? (value as { path: string }).path
        : null;
    if (path && path.trim()) return path.trim();
  }
  return null;
}

/**
 * Production SoT: order.status_code (TourySystemStatusCodes).
 * Legacy aliases (`status` / `Status` / `lifecycle_status`) secondary only.
 */
function lifecycleCompleted(data: Record<string, unknown>): boolean {
  const resolved = resolveTripLifecycleStatus({
    status_code:
      typeof data.status_code === "string" ? data.status_code : null,
    order_status:
      typeof data.order_status === "string" ? data.order_status : null,
    status:
      typeof data.status === "string"
        ? data.status
        : typeof data.Status === "string"
          ? data.Status
          : typeof data.lifecycle_status === "string"
            ? data.lifecycle_status
            : null,
    halh_order:
      typeof data.halhOrderMndob === "string"
        ? data.halhOrderMndob
        : typeof data.halh_order === "string"
          ? data.halh_order
          : null,
    finished: typeof data.finished === "boolean" ? data.finished : null,
  });
  if (resolved.status === "completed") return true;

  // Fixtures / pre-status_code docs: accept explicit completed aliases when
  // resolveTripLifecycleStatus returns unmapped without status_code.
  const legacy = String(
    data.status_code ??
      data.status ??
      data.Status ??
      data.lifecycle_status ??
      "",
  )
    .trim()
    .toLowerCase();
  return (
    legacy === "completed" ||
    legacy === "complete" ||
    legacy === "trip_completed" ||
    legacy === "done" ||
    legacy === "finished"
  );
}

function resolveOrderCountryId(data: Record<string, unknown>): string | null {
  if (typeof data.country_id === "string" && data.country_id.trim()) {
    return data.country_id.trim();
  }
  if (typeof data.countryId === "string" && data.countryId.trim()) {
    return data.countryId.trim();
  }
  return (
    refFullPath(data.countryRef) ??
    refFullPath(data.Rev_dolh) ??
    refFullPath(data.country)
  );
}

function resolveOrderDriverId(data: Record<string, unknown>): string | null {
  if (typeof data.driver_id === "string" && data.driver_id.trim()) {
    return data.driver_id.trim();
  }
  if (typeof data.driverId === "string" && data.driverId.trim()) {
    return data.driverId.trim();
  }
  return refPathId(data.mndob_user) ?? refPathId(data.driverRef);
}

function paymentChannelFromOrder(
  data: Record<string, unknown>,
): "cash" | "card" | "unknown" {
  const resolved = resolveTripPayment({
    PaymentMethod: data.PaymentMethod,
    paymentMethod: data.paymentMethod,
    payment_method: data.payment_method,
    payment_status: data.payment_status,
    paymentStatus: data.paymentStatus,
  });
  if (resolved.method === "cash") return "cash";
  if (resolved.method === "online") return "card";
  return "unknown";
}

export type ProductionOrderReadInput = {
  documentId: string;
  data: Record<string, unknown>;
  /** Ignored for historical attribution (D-08). */
  currentCountryAgentId?: string | null;
  /**
   * Optional source metadata. Registry fixtures
   * (`admin_next_finance_fr1_order_fixtures`) are rejected unless
   * FINANCE_FR1_REGISTRY_PILOT=1 (controlled Finance pilot only).
   */
  sourceCollection?: string;
  sourceKind?: "order" | "registry_fixture" | string;
  /** Explicit flag override for offline tests / gated callers (else process.env). */
  registryPilotFlag?: string | null;
};

export type ProductionSettlementReadInput = {
  documentId: string;
  data: Record<string, unknown>;
};

export type ProductionFinanceShadowDto = {
  trip: ReturnType<FinanceReadService["toTripDto"]>;
  driverLine: ReturnType<FinanceReadService["toLineDto"]>;
  agentLine: ReturnType<FinanceReadService["toLineDto"]>;
  snapshot: TripFinancialSnapshot;
  productionWrites: 0;
};

/**
 * Map a Legacy order document → TripFinancialSnapshot (read-only).
 * Registry-backed inputs are rejected unless FINANCE_FR1_REGISTRY_PILOT=1.
 */
export function mapOrderToTripFinancialSnapshot(
  input: ProductionOrderReadInput,
): TripFinancialSnapshot {
  assertProductionFinanceRejectsRegistryInput({
    sourceCollection: input.sourceCollection,
    sourceKind: input.sourceKind,
    registryPilotFlag:
      input.registryPilotFlag !== undefined
        ? input.registryPilotFlag
        : process.env.FINANCE_FR1_REGISTRY_PILOT,
  });

  const data = asRecord(input.data);
  const currencyRaw =
    (typeof data.currencyCode === "string" && data.currencyCode) ||
    (typeof data.currency === "string" && data.currency) ||
    (typeof data.currency_code === "string" && data.currency_code) ||
    null;
  // Do not invent currency when absent (TripFinancialSafeRead contract).
  const currency = currencyRaw ? String(currencyRaw).trim().toUpperCase() : "";

  const payment = resolveTripPayment({
    PaymentMethod: data.PaymentMethod,
    paymentMethod: data.paymentMethod,
    payment_method: data.payment_method,
    payment_status: data.payment_status,
    paymentStatus: data.paymentStatus,
  });

  const agentId =
    (typeof data.agent_id === "string" && data.agent_id) ||
    (typeof data.agentId === "string" && data.agentId) ||
    null;
  const agentAmount =
    data.agent_amount_minor != null
      ? typeof data.agent_amount_minor === "bigint"
        ? data.agent_amount_minor
        : typeof data.agent_amount_minor === "number"
          ? BigInt(Math.round(data.agent_amount_minor))
          : null
      : data.agent_amount != null && typeof data.agent_amount === "number"
        ? majorToMinor(data.agent_amount)
        : null;
  const agentRate =
    typeof data.agent_rate === "number"
      ? data.agent_rate
      : typeof data.Agent_total === "number"
        ? data.Agent_total
        : null;

  const snapshot = buildTripFinancialSnapshot({
    orderId: input.documentId,
    currency,
    grossFareMinor: readMajorMinor(data, "total_mndob2"),
    customerTotalMinor: readMajorMinor(data, "total"),
    platformCommissionMinor: readMajorMinor(data, "total_app"),
    vatAmountMinor: readMajorMinor(data, "total_vat"),
    driverNetMinor: readMajorMinor(data, "total_mndob"),
    paymentChannel: paymentChannelFromOrder(data),
    paymentStatus: payment.statusRaw ?? payment.status,
    lifecycleCompleted: lifecycleCompleted(data),
    agentSnapshot: {
      agentId,
      amountMinor: agentAmount,
      ratePercent: agentRate,
    },
    currentCountryAgentId: input.currentCountryAgentId,
    refundSessionAmountMinor:
      data.refund_amount_minor != null &&
      typeof data.refund_amount_minor === "number"
        ? BigInt(Math.round(data.refund_amount_minor))
        : undefined,
  });

  return {
    ...snapshot,
    countryId: resolveOrderCountryId(data),
    driverId: resolveOrderDriverId(data),
  };
}

export function mapOrderToAccountingLines(
  input: ProductionOrderReadInput,
): { driverLine: AccountingLine; agentLine: AccountingLine; snapshot: TripFinancialSnapshot } {
  const snapshot = mapOrderToTripFinancialSnapshot(input);
  const driverId = snapshot.driverId ?? "unknown_driver";
  return {
    snapshot,
    driverLine: buildDriverAccountingLine(snapshot, driverId),
    agentLine: buildAgentAccountingLine(snapshot),
  };
}

function parseStatus(raw: unknown): SettlementV2Status {
  const s = String(raw ?? "draft").toLowerCase();
  if (V2_STATUS_SET.has(s)) return s as SettlementV2Status;
  return "draft";
}

function parsePartyType(raw: unknown): SettlementPartyType {
  const s = String(raw ?? "driver").toLowerCase();
  if (s === "agent") return "agent";
  return "driver";
}

function parseDirection(
  raw: unknown,
  partyType: SettlementPartyType,
): SettlementDirection {
  const s = String(raw ?? "").toUpperCase();
  if (
    s === "DRIVER_PAYS_COMPANY" ||
    s === "COMPANY_PAYS_DRIVER" ||
    s === "AGENT_PAYS_COMPANY" ||
    s === "COMPANY_PAYS_AGENT"
  ) {
    return s;
  }
  return partyType === "agent" ? "COMPANY_PAYS_AGENT" : "DRIVER_PAYS_COMPANY";
}

function readIntMinor(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.round(v));
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return BigInt(Math.round(Number(v)));
  }
  return BigInt(0);
}

function readOptionalIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Map Legacy financial_settlements doc → SettlementV2 read model.
 * Additive: partyType defaults to "driver" when absent.
 * Never invents currency when absent.
 */
export function mapFinancialSettlementDoc(
  input: ProductionSettlementReadInput,
): SettlementV2 {
  const data = asRecord(input.data);
  const partyType = parsePartyType(data.partyType ?? data.party_type);
  const currencyRaw =
    (typeof data.currency === "string" && data.currency) ||
    (typeof data.currencyCode === "string" && data.currencyCode) ||
    (typeof data.currency_code === "string" && data.currency_code) ||
    "";
  const currency = currencyRaw ? String(currencyRaw).trim().toUpperCase() : "";
  const amountMinor = readIntMinor(
    data.amountMinor ??
      data.amount_minor ??
      data.absoluteSettlementAmountMinor ??
      data.amount,
  );
  const paid = readIntMinor(
    data.paidConfirmedMinor ?? data.paid_confirmed_minor ?? data.paidAmount,
  );
  const now = new Date().toISOString();
  const periodFromUtc =
    readOptionalIso(data.periodFromUtc) ??
    readOptionalIso(data.period_from) ??
    readOptionalIso(data.periodStart) ??
    now;
  const periodToUtc =
    readOptionalIso(data.periodToUtc) ??
    readOptionalIso(data.period_to) ??
    readOptionalIso(data.periodEnd) ??
    now;

  let claims: SettlementV2["claims"] = [];
  if (Array.isArray(data.claims)) {
    claims = (data.claims as Array<Record<string, unknown>>).map((c, i) => ({
      lineId: String(c.lineId ?? c.line_id ?? `claim_${i}`),
      orderId: String(c.orderId ?? c.order_id ?? ""),
      amountMinor: readIntMinor(c.amountMinor ?? c.amount_minor),
      currency: String(c.currency ?? currency),
    }));
  } else if (Array.isArray(data.eligibleOrderIds)) {
    // Production V2 often stores eligible order ids without nested claim minors.
    claims = (data.eligibleOrderIds as unknown[]).map((oid, i) => ({
      lineId: `eligible_${i}`,
      orderId: String(oid ?? ""),
      amountMinor: 0n,
      currency,
    }));
  }

  const countryId =
    (typeof data.countryId === "string" && data.countryId) ||
    (typeof data.country_id === "string" && data.country_id) ||
    refFullPath(data.countryRef) ||
    "";

  return {
    id: input.documentId,
    partyType,
    partyId: String(
      data.partyId ?? data.party_id ?? data.driverId ?? data.driver_id ?? "",
    ),
    countryId: String(countryId),
    currency,
    status: parseStatus(data.status),
    direction: parseDirection(data.direction, partyType),
    amountMinor,
    paidConfirmedMinor: paid,
    periodFromUtc,
    periodToUtc,
    claims,
    createdByUserId: String(
      data.createdByUserId ?? data.created_by ?? data.createdBy ?? "",
    ),
    lockedByUserId:
      data.lockedByUserId != null
        ? String(data.lockedByUserId)
        : data.locked_by != null
          ? String(data.locked_by)
          : data.lockedBy != null
            ? String(data.lockedBy)
            : null,
    voidedByUserId: null,
    idempotencyKey: String(data.idempotencyKey ?? data.idempotency_key ?? ""),
    correlationId: String(data.correlationId ?? data.correlation_id ?? ""),
    createdAtUtc:
      readOptionalIso(data.createdAtUtc) ??
      readOptionalIso(data.created_at) ??
      readOptionalIso(data.createdAt) ??
      now,
    updatedAtUtc:
      readOptionalIso(data.updatedAtUtc) ??
      readOptionalIso(data.updated_at) ??
      readOptionalIso(data.updatedAt) ??
      now,
    dueAtUtc: data.dueAtUtc != null ? String(data.dueAtUtc) : null,
    productionApproved: false,
  };
}

export class ProductionFinanceReadAdapter {
  private readonly reads = new FinanceReadService();

  /** Shadow DTO for one order — zero Production writes. */
  shadowTrip(input: ProductionOrderReadInput): ProductionFinanceShadowDto {
    const mapped = mapOrderToAccountingLines(input);
    return {
      trip: this.reads.toTripDto(mapped.snapshot),
      driverLine: this.reads.toLineDto(mapped.driverLine),
      agentLine: this.reads.toLineDto(mapped.agentLine),
      snapshot: mapped.snapshot,
      productionWrites: 0,
    };
  }

  shadowSettlement(input: ProductionSettlementReadInput) {
    const settlement = mapFinancialSettlementDoc(input);
    return {
      settlement: this.reads.toSettlementDto(settlement),
      raw: settlement,
      productionWrites: 0 as const,
    };
  }
}

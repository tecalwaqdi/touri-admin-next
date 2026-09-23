/**
 * FR1 — Materialize deterministic accounting snapshot (offline Fake).
 * Historical snapshot immutable; corrections via adj/reversal only.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  buildTripFinancialSnapshot,
  type TripFinancialSnapshot,
} from "@/domain/finance/v2/TripFinancialSnapshot";
import { resolveDiscountAccounting } from "@/domain/finance/v2/policies/DiscountTreatmentPolicyF6";
import type { DiscountFundingOwner } from "@/domain/finance/v2/policies/DiscountTreatmentPolicyF6";
import { buildGatewayFeeComponent } from "@/domain/finance/v2/policies/GatewayFeePolicyF6";
import { assertEligibleForCertifiedSnapshot } from "@/domain/finance/v2/CertifiedSnapshotEligibility";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { assertFinanceWriteStillDisabled } from "@/application/finance/rollout/FinanceRolloutFlags";

export type AccountingSnapshotRecord = {
  id: string;
  orderId: string;
  countryId: string;
  currency: string;
  snapshot: TripFinancialSnapshot;
  /** Independent FC-05 component — never silent-deducted from driver/agent. */
  gatewayFeeMinor: bigint | null;
  gatewayFeeAmountSource: string;
  gatewayFeeOwner: string;
  discountPolicyBlocked: boolean;
  immutableHash: string;
  mutatesOrderMajors: false;
  idempotencyKey: string;
  createdByUserId: string;
  createdAtUtc: string;
};

type Actor = {
  userId: string;
  permissions: FinancePermission[];
  countryIds?: string[];
};

function requirePrepare(actor: Actor): void {
  const ok =
    actor.permissions.includes("settlements:prepare") ||
    actor.permissions.includes("settlements:create");
  if (!ok) throw new Error("rbac_denied:settlements:prepare");
}

function assertCountry(actor: Actor, countryId: string): void {
  if (actor.countryIds && actor.countryIds.length > 0) {
    if (!actor.countryIds.includes(countryId)) {
      throw new Error(`cross_country_denied:${countryId}`);
    }
  }
}

function hashSnapshot(parts: string[]): string {
  // Deterministic non-crypto fingerprint for offline immutability checks.
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `snap_${(h >>> 0).toString(16)}`;
}

export class AccountingSnapshotCommandService {
  private readonly byId = new Map<string, AccountingSnapshotRecord>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly byOrder = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async materialize(
    actor: Actor,
    input: {
      orderId: string;
      countryId: string;
      currency: string;
      grossFareMinor: bigint | null;
      customerTotalMinor: bigint | null;
      platformCommissionMinor: bigint | null;
      vatAmountMinor: bigint | null;
      driverNetMinor: bigint | null;
      paymentChannel: "cash" | "card" | "unknown";
      paymentStatus: string;
      lifecycleCompleted: boolean;
      driverId: string | null;
      agentSnapshot?: {
        agentId?: string | null;
        amountMinor?: bigint | number | null;
        ratePercent?: number | null;
      };
      discountFundingOwner?: DiscountFundingOwner | null;
      /**
       * Gateway fee (FC-05):
       * - omit / undefined → apply current-ops (card SAR = 1 SAR; cash = 0)
       * - null → not represented (do not invent from current-ops)
       * - bigint → explicit / historical amount (authoritative; no reprice)
       */
      gatewayFeeMinor?: bigint | null;
      providerId?: string | null;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<AccountingSnapshotRecord> {
    assertFinanceWriteStillDisabled(false);
    requirePrepare(actor);
    this.gate.requireWritable("snapshot.materialize");

    if (!input.currency?.trim()) throw new Error("currency_required");
    if (!input.lifecycleCompleted) throw new Error("trip_not_completed");
    assertEligibleForCertifiedSnapshot({
      lifecycleStatus: input.lifecycleCompleted ? "completed" : "unmapped",
      lifecycleCompleted: input.lifecycleCompleted,
      paymentChannel: input.paymentChannel,
      paymentStatus: input.paymentStatus,
    });
    assertCountry(actor, input.countryId);

    // Fail closed: missing authoritative majors must not become zero.
    if (input.driverNetMinor === null) {
      throw new Error("missing_value_fail_closed:driverNet");
    }
    if (input.grossFareMinor === null) {
      throw new Error("missing_value_fail_closed:grossFare");
    }

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "snapshot.materialize",
      resourceType: "order",
      resourceId: input.orderId,
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    const priorOrder = this.byOrder.get(input.orderId);
    if (priorOrder) {
      // Historical immutable — return existing; no silent edit.
      return this.byId.get(priorOrder)!;
    }

    await this.audit.record({
      actorUserId: actor.userId,
      action: "snapshot.materialize.intent",
      resourceType: "finance_accounting_snapshots",
      resourceId: input.orderId,
      correlationId: input.correlationId,
      idempotencyKey,
    });

    const snapshot = buildTripFinancialSnapshot({
      orderId: input.orderId,
      currency: input.currency,
      grossFareMinor: input.grossFareMinor,
      customerTotalMinor: input.customerTotalMinor,
      platformCommissionMinor: input.platformCommissionMinor,
      vatAmountMinor: input.vatAmountMinor,
      driverNetMinor: input.driverNetMinor,
      paymentChannel: input.paymentChannel,
      paymentStatus: input.paymentStatus,
      lifecycleCompleted: input.lifecycleCompleted,
      agentSnapshot: input.agentSnapshot,
    });

    const discount = resolveDiscountAccounting({
      currency: input.currency,
      grossFareMinor: input.grossFareMinor,
      customerTotalMinor: input.customerTotalMinor,
      fundingOwner: input.discountFundingOwner ?? null,
    });

    // Gateway fee independent (FC-05); not deducted from driver/agent here.
    // Historical / explicit amounts win; omit → current-ops for NEW materialization.
    const hasExplicitGateway =
      Object.prototype.hasOwnProperty.call(input, "gatewayFeeMinor");
    const gateway = hasExplicitGateway
      ? buildGatewayFeeComponent({
          currency: input.currency,
          historicalPersistedMinor:
            input.gatewayFeeMinor === undefined
              ? undefined
              : input.gatewayFeeMinor,
          paymentChannel: input.paymentChannel,
          countryId: input.countryId,
          providerId: input.providerId ?? null,
          applyCurrentOpsWhenMissing: false,
        })
      : buildGatewayFeeComponent({
          currency: input.currency,
          paymentChannel: input.paymentChannel,
          countryId: input.countryId,
          providerId: input.providerId ?? null,
          applyCurrentOpsWhenMissing: true,
        });

    this.seq += 1;
    const immutableHash = hashSnapshot([
      input.orderId,
      input.currency,
      String(input.grossFareMinor),
      String(input.driverNetMinor),
      String(input.platformCommissionMinor),
      String(input.vatAmountMinor),
      String(gateway.amountMinor),
    ]);

    const record: AccountingSnapshotRecord = {
      id: `fake_snap_${this.seq}`,
      orderId: input.orderId,
      countryId: input.countryId,
      currency: input.currency.toUpperCase(),
      snapshot: {
        ...snapshot,
        driverId: input.driverId,
        countryId: input.countryId,
      },
      gatewayFeeMinor: gateway.amountMinor,
      gatewayFeeAmountSource: gateway.amountSource,
      gatewayFeeOwner: gateway.owner,
      discountPolicyBlocked: discount.policyBlocked,
      immutableHash,
      mutatesOrderMajors: false,
      idempotencyKey,
      createdByUserId: actor.userId,
      createdAtUtc: new Date().toISOString(),
    };

    this.byId.set(record.id, record);
    this.byIdempotency.set(idempotencyKey, record.id);
    this.byOrder.set(input.orderId, record.id);

    await this.audit.record({
      actorUserId: actor.userId,
      action: "snapshot.materialize.result",
      resourceType: "finance_accounting_snapshots",
      resourceId: record.id,
      correlationId: input.correlationId,
      idempotencyKey,
    });

    return record;
  }

  get(id: string): AccountingSnapshotRecord | undefined {
    return this.byId.get(id);
  }

  getByOrder(orderId: string): AccountingSnapshotRecord | undefined {
    const id = this.byOrder.get(orderId);
    return id ? this.byId.get(id) : undefined;
  }
}

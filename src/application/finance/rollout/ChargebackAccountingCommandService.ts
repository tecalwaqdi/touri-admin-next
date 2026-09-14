/**
 * FR6 — Chargeback accounting (FC-04 APPROVED). Append-only; no trip rewrite.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  assertChargebackDoesNotRewriteTrip,
  resolveChargebackLiability,
  type ChargebackAccountingRecord,
  type ChargebackLiabilityParty,
} from "@/domain/finance/v2/policies/ChargebackAccountingPolicyF6";
import {
  assertChargebackFeeSeparate,
  assertCurrencyMatch,
  assertReasonPresent,
} from "@/domain/finance/v2/Fr6CorrectionIntegrity";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { assertFinanceWriteStillDisabled } from "@/application/finance/rollout/FinanceRolloutFlags";

type Actor = { userId: string; permissions: FinancePermission[]; countryIds?: string[] };

export class ChargebackAccountingCommandService {
  private readonly byId = new Map<string, ChargebackAccountingRecord>();
  private readonly byIdempotency = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async record(
    actor: Actor,
    input: {
      relatedOrderId: string;
      countryId: string;
      currency: string;
      amountMinor: bigint | null;
      feeAmountMinor: bigint | null;
      evidencePresent: boolean;
      liabilityParty?: ChargebackLiabilityParty | null;
      disputed?: boolean;
      reason?: string;
      sourceCurrency?: string | null;
      mergedFeeIntoPrincipal?: boolean;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<ChargebackAccountingRecord> {
    assertFinanceWriteStillDisabled(false);
    if (!actor.permissions.includes("finance:adjust")) {
      throw new Error("rbac_denied:finance:adjust");
    }
    this.gate.requireWritable("chargeback.account");
    if (!input.currency?.trim()) throw new Error("currency_required");
    if (!input.relatedOrderId?.trim()) {
      throw new Error("missing_source:relatedOrderId");
    }
    assertReasonPresent(input.reason ?? "chargeback_accounting");
    assertCurrencyMatch({
      currency: input.currency,
      sourceCurrency: input.sourceCurrency,
    });
    if (actor.countryIds?.length && !actor.countryIds.includes(input.countryId)) {
      throw new Error(`cross_country_denied:${input.countryId}`);
    }
    if (input.amountMinor === null) {
      throw new Error("missing_value_fail_closed:chargeback_amount");
    }
    assertChargebackFeeSeparate({
      amountMinor: input.amountMinor,
      feeAmountMinor: input.feeAmountMinor,
      mergedFeeIntoPrincipal: input.mergedFeeIntoPrincipal,
    });

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "chargeback.account",
      resourceType: "finance_chargeback_accounting",
      resourceId: input.relatedOrderId,
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    const liabilityParty = resolveChargebackLiability({
      evidencePresent: input.evidencePresent,
      liabilityParty: input.liabilityParty,
      disputed: input.disputed,
    });

    this.seq += 1;
    const row: ChargebackAccountingRecord = {
      id: `fake_cb_${this.seq}`,
      relatedOrderId: input.relatedOrderId,
      countryId: input.countryId,
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      feeAmountMinor: input.feeAmountMinor,
      status:
        liabilityParty === "disputed_suspense"
          ? "disputed_suspense"
          : "liability_attributed",
      liabilityParty,
      evidencePresent: input.evidencePresent,
      mutatesOrderMajors: false,
      idempotencyKey,
      createdByUserId: actor.userId,
      createdAtUtc: new Date().toISOString(),
    };
    assertChargebackDoesNotRewriteTrip(row);
    this.byId.set(row.id, row);
    this.byIdempotency.set(idempotencyKey, row.id);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "chargeback.account",
      resourceType: "finance_chargeback_accounting",
      resourceId: row.id,
      correlationId: input.correlationId,
      idempotencyKey,
      reason: input.reason ?? "chargeback_accounting",
    });
    return row;
  }

  get(id: string): ChargebackAccountingRecord | undefined {
    return this.byId.get(id);
  }
}

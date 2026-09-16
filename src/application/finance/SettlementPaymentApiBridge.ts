/**
 * Settlement payment depth — FR5 create/confirm/reverse API bridge.
 * No second ledger. SoD via settlements:execute / settlements:reverse.
 * Production denied via FinanceWriteGate.
 */

import {
  SettlementCommandService,
  type ActorContext,
} from "@/application/finance/SettlementCommandService";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import type { SettlementPayment } from "@/domain/settlement/v2/SettlementPayment";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import { outstandingMinor } from "@/domain/settlement/v2/SettlementV2";

const offlineRepo = new FakeSettlementV2Repository();
const offlineAudit = new FinanceAuditService(new FakeFinanceAuditRepository());

export function getSettlementCommandService(opts?: {
  allowOffline?: boolean;
}): SettlementCommandService {
  const allowOffline = opts?.allowOffline === true;
  const gate = allowOffline
    ? createOfflineFakeFinanceWriteGate()
    : createProductionFinanceWriteGate();
  // Production path uses Fake repo only as a non-mutating stand-in:
  // FinanceWriteGate denies before any repository call.
  return new SettlementCommandService(offlineRepo, gate, offlineAudit);
}

/** Expose Fake repo for offline tests / harness seeding. */
export function getOfflineSettlementV2Repository(): FakeSettlementV2Repository {
  return offlineRepo;
}

export type SettlementPaymentAction = "create" | "confirm" | "reverse";

export async function executeSettlementPaymentAction(input: {
  actor: ActorContext;
  action: SettlementPaymentAction;
  settlementId: string;
  paymentId?: string;
  amountMinor?: bigint;
  reason?: string;
  clientKey: string;
  correlationId: string;
  allowOffline: boolean;
}): Promise<{
  ok: boolean;
  productionWriteExecuted: false;
  payment?: SettlementPayment;
  settlement?: SettlementV2;
  outstandingMinor?: string;
  code: string;
  message: string;
}> {
  const service = getSettlementCommandService({
    allowOffline: input.allowOffline,
  });

  try {
    if (input.action === "create") {
      if (input.amountMinor == null) {
        return {
          ok: false,
          productionWriteExecuted: false,
          code: "VALIDATION_FAILED",
          message: "amountMinor required",
        };
      }
      const payment = await service.createPayment(input.actor, {
        settlementId: input.settlementId,
        amountMinor: input.amountMinor,
        clientKey: input.clientKey,
        correlationId: input.correlationId,
      });
      const settlement = await offlineRepo.get(input.settlementId);
      return {
        ok: true,
        productionWriteExecuted: false,
        payment,
        settlement: settlement ?? undefined,
        outstandingMinor: settlement
          ? outstandingMinor(settlement).toString()
          : undefined,
        code: "APPLIED",
        message: "payment_created",
      };
    }

    if (input.action === "confirm") {
      if (!input.paymentId) {
        return {
          ok: false,
          productionWriteExecuted: false,
          code: "VALIDATION_FAILED",
          message: "paymentId required",
        };
      }
      const result = await service.confirmPayment(input.actor, {
        paymentId: input.paymentId,
        clientKey: input.clientKey,
        correlationId: input.correlationId,
      });
      return {
        ok: true,
        productionWriteExecuted: false,
        payment: result.payment,
        settlement: result.settlement,
        outstandingMinor: outstandingMinor(result.settlement).toString(),
        code: "APPLIED",
        message: "payment_confirmed",
      };
    }

    if (!input.paymentId) {
      return {
        ok: false,
        productionWriteExecuted: false,
        code: "VALIDATION_FAILED",
        message: "paymentId required",
      };
    }
    const result = await service.reversePayment(input.actor, {
      paymentId: input.paymentId,
      reason: input.reason ?? "operational_reverse",
      clientKey: input.clientKey,
      correlationId: input.correlationId,
    });
    return {
      ok: true,
      productionWriteExecuted: false,
      payment: result.payment,
      settlement: result.settlement,
      outstandingMinor: outstandingMinor(result.settlement).toString(),
      code: "APPLIED",
      message: "payment_reversed",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const denied =
      msg.includes("production_finance_write_denied") ||
      msg.startsWith("rbac_denied:");
    return {
      ok: false,
      productionWriteExecuted: false,
      code: denied ? "DENIED" : "FAILED",
      message: msg,
    };
  }
}

/**
 * Ports for FR6 adjustment pilot live apply (4 writes).
 * Fake for offline tests; Firebase ADC for live operator path.
 * Never mutates FR1 snapshot / settlement / payment / order.
 */

import {
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
  FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_SOURCE_ORDER_ID,
  FINANCE_FR6_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr6ApplyDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr6ApplyCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr6ApplyWriteCounter = {
  adjustmentCreates: number;
  adjustmentUpdates: number;
  auditIntentWrites: number;
  auditResultWrites: number;
  idempotencyWrites: number;
  settlementWrites: number;
  paymentWrites: number;
  snapshotWrites: number;
  orderWrites: number;
  refundWrites: number;
  chargebackWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  productionReads: number;
};

export function createFinanceFr6ApplyWriteCounter(): FinanceFr6ApplyWriteCounter {
  return {
    adjustmentCreates: 0,
    adjustmentUpdates: 0,
    auditIntentWrites: 0,
    auditResultWrites: 0,
    idempotencyWrites: 0,
    settlementWrites: 0,
    paymentWrites: 0,
    snapshotWrites: 0,
    orderWrites: 0,
    refundWrites: 0,
    chargebackWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    productionReads: 0,
  };
}

export function financeFr6ApplyTotalWrites(
  c: FinanceFr6ApplyWriteCounter,
): number {
  return (
    c.adjustmentCreates +
    c.adjustmentUpdates +
    c.auditIntentWrites +
    c.auditResultWrites +
    c.idempotencyWrites
  );
}

export function financeFr6ApplyForbiddenWritesZero(
  c: FinanceFr6ApplyWriteCounter,
): boolean {
  return (
    c.settlementWrites === 0 &&
    c.paymentWrites === 0 &&
    c.snapshotWrites === 0 &&
    c.orderWrites === 0 &&
    c.refundWrites === 0 &&
    c.chargebackWrites === 0 &&
    c.driverWrites === 0 &&
    c.agentWrites === 0 &&
    c.customerWrites === 0 &&
    c.authWrites === 0
  );
}

export type FinanceFr6ApplyActor = {
  uid: string;
  role: string;
  permissions: FinancePermission[];
};

export type FinanceFr6ApplyActorResolver = {
  resolve(input: {
    idToken: string;
  }): Promise<FinanceFr6ApplyActor | null>;
};

export type FinanceFr6ApplyFirestorePort = {
  getFr1SnapshotDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getSettlementDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getPaymentDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getAdjustmentDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getFr6IdempotencyDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getOrderDoc(): Promise<FinanceFr6ApplyDocSnap>;
  getAuditDoc(id: string): Promise<FinanceFr6ApplyDocSnap>;
  createAdjustmentDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr6ApplyCreateResult>;
  createAuditDoc(
    id: string,
    data: Record<string, unknown>,
  ): Promise<FinanceFr6ApplyCreateResult>;
  createIdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr6ApplyCreateResult>;
  getWriteCounter(): FinanceFr6ApplyWriteCounter;
};

export function createFakeFinanceFr6ApplyFirestorePort(seed?: {
  settlement?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  adjustment?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
}): FinanceFr6ApplyFirestorePort {
  const counter = createFinanceFr6ApplyWriteCounter();
  const store = {
    settlement: seed?.settlement ?? null,
    payment: seed?.payment ?? null,
    snapshot: seed?.snapshot ?? null,
    adjustment: seed?.adjustment ?? null,
    idempotency: seed?.idempotency ?? null,
    order: seed?.order ?? null,
    audits: new Map<string, Record<string, unknown>>(),
  };

  const snap = (
    data: Record<string, unknown> | null,
  ): FinanceFr6ApplyDocSnap => ({
    exists: data != null,
    data,
  });

  return {
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return snap(store.snapshot);
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return snap(store.settlement);
    },
    async getPaymentDoc() {
      counter.productionReads += 1;
      return snap(store.payment);
    },
    async getAdjustmentDoc() {
      counter.productionReads += 1;
      return snap(store.adjustment);
    },
    async getFr6IdempotencyDoc() {
      counter.productionReads += 1;
      return snap(store.idempotency);
    },
    async getOrderDoc() {
      counter.productionReads += 1;
      return snap(store.order);
    },
    async getAuditDoc(id) {
      counter.productionReads += 1;
      return snap(store.audits.get(id) ?? null);
    },
    async createAdjustmentDoc(data) {
      if (store.adjustment) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: FINANCE_FR6_ADJUSTMENT_DOC_ID,
        };
      }
      store.adjustment = { ...data, id: FINANCE_FR6_ADJUSTMENT_DOC_ID };
      counter.adjustmentCreates += 1;
      return { ok: true, id: FINANCE_FR6_ADJUSTMENT_DOC_ID };
    },
    async createAuditDoc(id, data) {
      if (store.audits.has(id)) {
        return { ok: false, code: "ALREADY_EXISTS", message: id };
      }
      store.audits.set(id, { ...data, id });
      if (String(data.action).includes("intent")) {
        counter.auditIntentWrites += 1;
      } else {
        counter.auditResultWrites += 1;
      }
      return { ok: true, id };
    },
    async createIdempotencyDoc(data) {
      if (store.idempotency) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
        };
      }
      store.idempotency = {
        ...data,
        id: FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
      };
      counter.idempotencyWrites += 1;
      return { ok: true, id: FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID };
    },
    getWriteCounter() {
      return counter;
    },
  };
}

export {
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_SOURCE_ORDER_ID,
  FINANCE_FR6_SOURCE_SNAPSHOT_ID,
};

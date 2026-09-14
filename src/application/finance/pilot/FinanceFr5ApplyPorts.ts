/**
 * Ports for FR5 Settlement Execution pilot live apply (5 writes).
 * Fake for offline tests; Firebase ADC for live operator path.
 * Payment CREATE + settlement UPDATE. Never mutates FR1 snapshot / order / wallet.
 */

import {
  FINANCE_FR5_AUDIT_COLLECTION,
  FINANCE_FR5_FR4_IDEMPOTENCY_DOC_ID,
  FINANCE_FR5_IDEMPOTENCY_COLLECTION,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR5_SETTLEMENT_COLLECTION,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SOURCE_ORDER_ID,
  FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR5_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";

export type FinanceFr5ApplyDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr5ApplyCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr5ApplyUpdateResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "UPDATE_FAILED" | "PRECONDITION_FAILED";
      message: string;
    };

export type FinanceFr5ApplyWriteCounter = {
  settlementUpdates: number;
  settlementCreates: number;
  paymentCreates: number;
  paymentUpdates: number;
  auditIntentWrites: number;
  auditResultWrites: number;
  idempotencyWrites: number;
  snapshotWrites: number;
  orderWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  walletWrites: number;
  payoutWrites: number;
  fr4IdempotencyWrites: number;
  productionReads: number;
};

export function createFinanceFr5ApplyWriteCounter(): FinanceFr5ApplyWriteCounter {
  return {
    settlementUpdates: 0,
    settlementCreates: 0,
    paymentCreates: 0,
    paymentUpdates: 0,
    auditIntentWrites: 0,
    auditResultWrites: 0,
    idempotencyWrites: 0,
    snapshotWrites: 0,
    orderWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    walletWrites: 0,
    payoutWrites: 0,
    fr4IdempotencyWrites: 0,
    productionReads: 0,
  };
}

export function financeFr5ApplyTotalWrites(
  c: FinanceFr5ApplyWriteCounter,
): number {
  return (
    c.settlementUpdates +
    c.paymentCreates +
    c.paymentUpdates +
    c.auditIntentWrites +
    c.auditResultWrites +
    c.idempotencyWrites
  );
}

export function financeFr5ApplyForbiddenWritesZero(
  c: FinanceFr5ApplyWriteCounter,
): boolean {
  return (
    c.settlementCreates === 0 &&
    c.snapshotWrites === 0 &&
    c.orderWrites === 0 &&
    c.driverWrites === 0 &&
    c.agentWrites === 0 &&
    c.customerWrites === 0 &&
    c.authWrites === 0 &&
    c.walletWrites === 0 &&
    c.payoutWrites === 0 &&
    c.fr4IdempotencyWrites === 0
  );
}

export type FinanceFr5ApplyFirestorePort = {
  getFr1SnapshotDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getFr4IdempotencyDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getSettlementDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getPaymentDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getFr5IdempotencyDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getOrderDoc(): Promise<FinanceFr5ApplyDocSnap>;
  getAuditDoc(id: string): Promise<FinanceFr5ApplyDocSnap>;
  createPaymentDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr5ApplyCreateResult>;
  updateSettlementExecution(
    patch: Record<string, unknown>,
  ): Promise<FinanceFr5ApplyUpdateResult>;
  createAuditDoc(
    id: string,
    data: Record<string, unknown>,
  ): Promise<FinanceFr5ApplyCreateResult>;
  createFr5IdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr5ApplyCreateResult>;
  counter: FinanceFr5ApplyWriteCounter;
};

export type FinanceFr5ApplyActor = {
  uid: string;
  role: string;
  permissions: string[];
};

export type FinanceFr5ApplyActorResolver = {
  resolve(token: string): Promise<
    | { ok: true; actor: FinanceFr5ApplyActor }
    | { ok: false; reason: string }
  >;
};

export function createFakeFinanceFr5ApplyFirestorePort(seed?: {
  fr1Snapshot?: Record<string, unknown> | null;
  fr4Idempotency?: Record<string, unknown> | null;
  settlement?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  fr5Idempotency?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  audits?: Record<string, Record<string, unknown>>;
}): FinanceFr5ApplyFirestorePort & {
  setSettlement(data: Record<string, unknown> | null): void;
  setPayment(data: Record<string, unknown> | null): void;
  setFr5Idempotency(data: Record<string, unknown> | null): void;
  getSettlementRaw(): Record<string, unknown> | null;
  getPaymentRaw(): Record<string, unknown> | null;
  getFr1SnapshotRaw(): Record<string, unknown> | null;
  getFr4IdempotencyRaw(): Record<string, unknown> | null;
} {
  const fr1Snapshot: Record<string, unknown> | null = seed?.fr1Snapshot ?? null;
  const fr4Idempotency: Record<string, unknown> | null =
    seed?.fr4Idempotency ?? null;
  let settlement: Record<string, unknown> | null = seed?.settlement ?? null;
  let payment: Record<string, unknown> | null = seed?.payment ?? null;
  let fr5Idempotency: Record<string, unknown> | null =
    seed?.fr5Idempotency ?? null;
  const order: Record<string, unknown> | null = seed?.order ?? null;
  const audits = new Map<string, Record<string, unknown>>(
    Object.entries(seed?.audits ?? {}),
  );
  const counter = createFinanceFr5ApplyWriteCounter();

  return {
    counter,
    setSettlement(data) {
      settlement = data;
    },
    setPayment(data) {
      payment = data;
    },
    setFr5Idempotency(data) {
      fr5Idempotency = data;
    },
    getSettlementRaw() {
      return settlement;
    },
    getPaymentRaw() {
      return payment;
    },
    getFr1SnapshotRaw() {
      return fr1Snapshot;
    },
    getFr4IdempotencyRaw() {
      return fr4Idempotency;
    },
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return { exists: fr1Snapshot != null, data: fr1Snapshot };
    },
    async getFr4IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr4Idempotency != null, data: fr4Idempotency };
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return { exists: settlement != null, data: settlement };
    },
    async getPaymentDoc() {
      counter.productionReads += 1;
      return { exists: payment != null, data: payment };
    },
    async getFr5IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr5Idempotency != null, data: fr5Idempotency };
    },
    async getOrderDoc() {
      counter.productionReads += 1;
      return { exists: order != null, data: order };
    },
    async getAuditDoc(id) {
      counter.productionReads += 1;
      const data = audits.get(id) ?? null;
      return { exists: data != null, data };
    },
    async createPaymentDoc(data) {
      if (payment != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "payment already exists",
        };
      }
      payment = { ...data, id: FINANCE_FR5_PAYMENT_DOC_ID };
      counter.paymentCreates += 1;
      return { ok: true, id: FINANCE_FR5_PAYMENT_DOC_ID };
    },
    async updateSettlementExecution(patch) {
      if (settlement == null) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "settlement not found",
        };
      }
      if (settlement.status !== "locked") {
        return {
          ok: false,
          code: "PRECONDITION_FAILED",
          message: `settlement status ${String(settlement.status)} not locked`,
        };
      }
      settlement = { ...settlement, ...patch };
      counter.settlementUpdates += 1;
      return { ok: true, id: FINANCE_FR5_SETTLEMENT_DOC_ID };
    },
    async createAuditDoc(id, data) {
      if (audits.has(id)) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "audit already exists",
        };
      }
      audits.set(id, { ...data });
      if (data.action === "payment.confirm.intent") {
        counter.auditIntentWrites += 1;
      } else if (data.action === "payment.confirm.result") {
        counter.auditResultWrites += 1;
      }
      return { ok: true, id };
    },
    async createFr5IdempotencyDoc(data) {
      if (fr5Idempotency != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "fr5 idempotency already exists",
        };
      }
      fr5Idempotency = { ...data };
      counter.idempotencyWrites += 1;
      return { ok: true, id: FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID };
    },
  };
}

void FINANCE_FR5_AUDIT_COLLECTION;
void FINANCE_FR5_IDEMPOTENCY_COLLECTION;
void FINANCE_FR5_SETTLEMENT_COLLECTION;
void FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION;
void FINANCE_FR5_SOURCE_SNAPSHOT_ID;
void FINANCE_FR5_FR4_IDEMPOTENCY_DOC_ID;
void FINANCE_FR5_SOURCE_ORDER_ID;

/**
 * Ports for FR4 Settlement Approval pilot live apply (4 writes).
 * Fake for offline tests; Firebase ADC for live operator path.
 * Settlement UPDATE only — never create a second settlement.
 * Never mutates finance_accounting_snapshots / settlement_payments.
 */

import {
  FINANCE_FR4_AUDIT_COLLECTION,
  FINANCE_FR4_FR2_IDEMPOTENCY_DOC_ID,
  FINANCE_FR4_IDEMPOTENCY_COLLECTION,
  FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR4_SETTLEMENT_COLLECTION,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_SOURCE_ORDER_ID,
  FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR4_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";

export type FinanceFr4ApplyDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr4ApplyCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr4ApplyUpdateResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "UPDATE_FAILED" | "PRECONDITION_FAILED";
      message: string;
    };

export type FinanceFr4ApplyWriteCounter = {
  settlementUpdates: number;
  settlementCreates: number;
  auditIntentWrites: number;
  auditResultWrites: number;
  idempotencyWrites: number;
  snapshotWrites: number;
  orderWrites: number;
  paymentWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  registryWrites: number;
  fr2IdempotencyWrites: number;
  productionReads: number;
};

export function createFinanceFr4ApplyWriteCounter(): FinanceFr4ApplyWriteCounter {
  return {
    settlementUpdates: 0,
    settlementCreates: 0,
    auditIntentWrites: 0,
    auditResultWrites: 0,
    idempotencyWrites: 0,
    snapshotWrites: 0,
    orderWrites: 0,
    paymentWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    registryWrites: 0,
    fr2IdempotencyWrites: 0,
    productionReads: 0,
  };
}

export function financeFr4ApplyTotalWrites(
  c: FinanceFr4ApplyWriteCounter,
): number {
  return (
    c.settlementUpdates +
    c.auditIntentWrites +
    c.auditResultWrites +
    c.idempotencyWrites
  );
}

export function financeFr4ApplyForbiddenWritesZero(
  c: FinanceFr4ApplyWriteCounter,
): boolean {
  return (
    c.settlementCreates === 0 &&
    c.snapshotWrites === 0 &&
    c.orderWrites === 0 &&
    c.paymentWrites === 0 &&
    c.driverWrites === 0 &&
    c.agentWrites === 0 &&
    c.customerWrites === 0 &&
    c.authWrites === 0 &&
    c.registryWrites === 0 &&
    c.fr2IdempotencyWrites === 0
  );
}

export type FinanceFr4ApplyFirestorePort = {
  getFr1SnapshotDoc(): Promise<FinanceFr4ApplyDocSnap>;
  getFr2IdempotencyDoc(): Promise<FinanceFr4ApplyDocSnap>;
  getSettlementDoc(): Promise<FinanceFr4ApplyDocSnap>;
  getFr4IdempotencyDoc(): Promise<FinanceFr4ApplyDocSnap>;
  getOrderDoc(): Promise<FinanceFr4ApplyDocSnap>;
  getAuditDoc(id: string): Promise<FinanceFr4ApplyDocSnap>;
  updateSettlementApproval(
    patch: Record<string, unknown>,
  ): Promise<FinanceFr4ApplyUpdateResult>;
  createAuditDoc(
    id: string,
    data: Record<string, unknown>,
  ): Promise<FinanceFr4ApplyCreateResult>;
  createFr4IdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr4ApplyCreateResult>;
  counter: FinanceFr4ApplyWriteCounter;
};

export type FinanceFr4ApplyActor = {
  uid: string;
  role: string;
  permissions: string[];
};

export type FinanceFr4ApplyActorResolver = {
  resolve(token: string): Promise<
    | { ok: true; actor: FinanceFr4ApplyActor }
    | { ok: false; reason: string }
  >;
};

export function createFakeFinanceFr4ApplyFirestorePort(seed?: {
  fr1Snapshot?: Record<string, unknown> | null;
  fr2Idempotency?: Record<string, unknown> | null;
  settlement?: Record<string, unknown> | null;
  fr4Idempotency?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  audits?: Record<string, Record<string, unknown>>;
}): FinanceFr4ApplyFirestorePort & {
  setSettlement(data: Record<string, unknown> | null): void;
  setFr4Idempotency(data: Record<string, unknown> | null): void;
  getSettlementRaw(): Record<string, unknown> | null;
  getFr1SnapshotRaw(): Record<string, unknown> | null;
  getFr2IdempotencyRaw(): Record<string, unknown> | null;
} {
  const fr1Snapshot: Record<string, unknown> | null = seed?.fr1Snapshot ?? null;
  const fr2Idempotency: Record<string, unknown> | null =
    seed?.fr2Idempotency ?? null;
  let settlement: Record<string, unknown> | null = seed?.settlement ?? null;
  let fr4Idempotency: Record<string, unknown> | null =
    seed?.fr4Idempotency ?? null;
  const order: Record<string, unknown> | null = seed?.order ?? null;
  const audits = new Map<string, Record<string, unknown>>(
    Object.entries(seed?.audits ?? {}),
  );
  const counter = createFinanceFr4ApplyWriteCounter();

  return {
    counter,
    setSettlement(data) {
      settlement = data;
    },
    setFr4Idempotency(data) {
      fr4Idempotency = data;
    },
    getSettlementRaw() {
      return settlement;
    },
    getFr1SnapshotRaw() {
      return fr1Snapshot;
    },
    getFr2IdempotencyRaw() {
      return fr2Idempotency;
    },
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return { exists: fr1Snapshot != null, data: fr1Snapshot };
    },
    async getFr2IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr2Idempotency != null, data: fr2Idempotency };
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return { exists: settlement != null, data: settlement };
    },
    async getFr4IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr4Idempotency != null, data: fr4Idempotency };
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
    async updateSettlementApproval(patch) {
      if (settlement == null) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "settlement not found",
        };
      }
      if (settlement.status !== "draft") {
        return {
          ok: false,
          code: "PRECONDITION_FAILED",
          message: `settlement status ${String(settlement.status)} not draft`,
        };
      }
      settlement = { ...settlement, ...patch };
      counter.settlementUpdates += 1;
      return { ok: true, id: FINANCE_FR4_SETTLEMENT_DOC_ID };
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
      if (data.action === "settlement.lock.intent") {
        counter.auditIntentWrites += 1;
      } else if (data.action === "settlement.lock.result") {
        counter.auditResultWrites += 1;
      }
      return { ok: true, id };
    },
    async createFr4IdempotencyDoc(data) {
      if (fr4Idempotency != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "fr4 idempotency already exists",
        };
      }
      fr4Idempotency = { ...data };
      counter.idempotencyWrites += 1;
      return { ok: true, id: FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID };
    },
  };
}

void FINANCE_FR4_AUDIT_COLLECTION;
void FINANCE_FR4_IDEMPOTENCY_COLLECTION;
void FINANCE_FR4_SETTLEMENT_COLLECTION;
void FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION;
void FINANCE_FR4_SOURCE_SNAPSHOT_ID;
void FINANCE_FR4_FR2_IDEMPOTENCY_DOC_ID;
void FINANCE_FR4_SOURCE_ORDER_ID;

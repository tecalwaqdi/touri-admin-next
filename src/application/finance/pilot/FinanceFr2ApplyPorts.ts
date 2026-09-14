/**
 * Ports for FR2 Settlement V2 pilot live apply (4 writes).
 * Fake for offline tests; Firebase ADC for live operator path.
 * Never mutates finance_accounting_snapshots.
 */

import {
  FINANCE_FR2_AUDIT_COLLECTION,
  FINANCE_FR2_IDEMPOTENCY_COLLECTION,
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_FR1_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export type FinanceFr2ApplyDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr2ApplyCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr2ApplyWriteCounter = {
  settlementWrites: number;
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
  productionReads: number;
};

export function createFinanceFr2ApplyWriteCounter(): FinanceFr2ApplyWriteCounter {
  return {
    settlementWrites: 0,
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
    productionReads: 0,
  };
}

export function financeFr2ApplyTotalWrites(
  c: FinanceFr2ApplyWriteCounter,
): number {
  return (
    c.settlementWrites +
    c.auditIntentWrites +
    c.auditResultWrites +
    c.idempotencyWrites
  );
}

export function financeFr2ApplyForbiddenWritesZero(
  c: FinanceFr2ApplyWriteCounter,
): boolean {
  return (
    c.snapshotWrites === 0 &&
    c.orderWrites === 0 &&
    c.paymentWrites === 0 &&
    c.driverWrites === 0 &&
    c.agentWrites === 0 &&
    c.customerWrites === 0 &&
    c.authWrites === 0 &&
    c.registryWrites === 0
  );
}

export type FinanceFr2ApplyFirestorePort = {
  getFr1SnapshotDoc(): Promise<FinanceFr2ApplyDocSnap>;
  getFr1IdempotencyDoc(): Promise<FinanceFr2ApplyDocSnap>;
  getSettlementDoc(): Promise<FinanceFr2ApplyDocSnap>;
  getFr2IdempotencyDoc(): Promise<FinanceFr2ApplyDocSnap>;
  getOrderDoc(): Promise<FinanceFr2ApplyDocSnap>;
  getAuditDoc(id: string): Promise<FinanceFr2ApplyDocSnap>;
  createSettlementDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr2ApplyCreateResult>;
  createAuditDoc(
    id: string,
    data: Record<string, unknown>,
  ): Promise<FinanceFr2ApplyCreateResult>;
  createFr2IdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr2ApplyCreateResult>;
  counter: FinanceFr2ApplyWriteCounter;
};

export type FinanceFr2ApplyActor = {
  uid: string;
  role: string;
  permissions: string[];
};

export type FinanceFr2ApplyActorResolver = {
  resolve(token: string): Promise<
    | { ok: true; actor: FinanceFr2ApplyActor }
    | { ok: false; reason: string }
  >;
};

export function createFakeFinanceFr2ApplyFirestorePort(seed?: {
  fr1Snapshot?: Record<string, unknown> | null;
  fr1Idempotency?: Record<string, unknown> | null;
  settlement?: Record<string, unknown> | null;
  fr2Idempotency?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  audits?: Record<string, Record<string, unknown>>;
}): FinanceFr2ApplyFirestorePort & {
  setFr1Snapshot(data: Record<string, unknown> | null): void;
  setFr1Idempotency(data: Record<string, unknown> | null): void;
  setSettlement(data: Record<string, unknown> | null): void;
  setFr2Idempotency(data: Record<string, unknown> | null): void;
  getFr1SnapshotRaw(): Record<string, unknown> | null;
} {
  let fr1Snapshot: Record<string, unknown> | null = seed?.fr1Snapshot ?? null;
  let fr1Idempotency: Record<string, unknown> | null =
    seed?.fr1Idempotency ?? null;
  let settlement: Record<string, unknown> | null = seed?.settlement ?? null;
  let fr2Idempotency: Record<string, unknown> | null =
    seed?.fr2Idempotency ?? null;
  const order: Record<string, unknown> | null = seed?.order ?? null;
  const audits = new Map<string, Record<string, unknown>>(
    Object.entries(seed?.audits ?? {}),
  );
  const counter = createFinanceFr2ApplyWriteCounter();

  return {
    counter,
    setFr1Snapshot(data) {
      fr1Snapshot = data;
    },
    setFr1Idempotency(data) {
      fr1Idempotency = data;
    },
    setSettlement(data) {
      settlement = data;
    },
    setFr2Idempotency(data) {
      fr2Idempotency = data;
    },
    getFr1SnapshotRaw() {
      return fr1Snapshot;
    },
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return { exists: fr1Snapshot != null, data: fr1Snapshot };
    },
    async getFr1IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr1Idempotency != null, data: fr1Idempotency };
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return { exists: settlement != null, data: settlement };
    },
    async getFr2IdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: fr2Idempotency != null, data: fr2Idempotency };
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
    async createSettlementDoc(data) {
      if (settlement != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "settlement already exists",
        };
      }
      settlement = { ...data };
      counter.settlementWrites += 1;
      return { ok: true, id: FINANCE_FR2_SETTLEMENT_DOC_ID };
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
      if (data.action === "settlement.create.intent") {
        counter.auditIntentWrites += 1;
      } else if (data.action === "settlement.create.result") {
        counter.auditResultWrites += 1;
      }
      return { ok: true, id };
    },
    async createFr2IdempotencyDoc(data) {
      if (fr2Idempotency != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "fr2 idempotency already exists",
        };
      }
      fr2Idempotency = { ...data };
      counter.idempotencyWrites += 1;
      return { ok: true, id: FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID };
    },
  };
}

void FINANCE_FR2_AUDIT_COLLECTION;
void FINANCE_FR2_IDEMPOTENCY_COLLECTION;
void FINANCE_FR2_SETTLEMENT_COLLECTION;
void FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION;
void FINANCE_FR2_SOURCE_SNAPSHOT_ID;
void FINANCE_FR2_SOURCE_FR1_IDEMPOTENCY_DOC_ID;
void FINANCE_FR1_SYNTHETIC_ORDER_ID;

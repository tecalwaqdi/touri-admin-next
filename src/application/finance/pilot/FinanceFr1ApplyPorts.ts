/**
 * Ports for FR1 Finance Pilot live apply (4 writes).
 * Fake for offline tests; Firebase ADC for live operator path.
 */

import {
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export type FinanceFr1ApplyDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr1ApplyCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type FinanceFr1ApplyWriteCounter = {
  snapshotWrites: number;
  auditIntentWrites: number;
  auditResultWrites: number;
  idempotencyWrites: number;
  orderWrites: number;
  settlementWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  registryWrites: number;
  fixtureProvisionIdempotencyWrites: number;
  productionReads: number;
};

export function createFinanceFr1ApplyWriteCounter(): FinanceFr1ApplyWriteCounter {
  return {
    snapshotWrites: 0,
    auditIntentWrites: 0,
    auditResultWrites: 0,
    idempotencyWrites: 0,
    orderWrites: 0,
    settlementWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    registryWrites: 0,
    fixtureProvisionIdempotencyWrites: 0,
    productionReads: 0,
  };
}

export function financeFr1ApplyTotalWrites(
  c: FinanceFr1ApplyWriteCounter,
): number {
  return (
    c.snapshotWrites +
    c.auditIntentWrites +
    c.auditResultWrites +
    c.idempotencyWrites
  );
}

export function financeFr1ApplyForbiddenWritesZero(
  c: FinanceFr1ApplyWriteCounter,
): boolean {
  return (
    c.orderWrites === 0 &&
    c.settlementWrites === 0 &&
    c.driverWrites === 0 &&
    c.agentWrites === 0 &&
    c.customerWrites === 0 &&
    c.authWrites === 0 &&
    c.registryWrites === 0 &&
    c.fixtureProvisionIdempotencyWrites === 0
  );
}

export type FinanceFr1ApplyFirestorePort = {
  getRegistryDoc(): Promise<FinanceFr1ApplyDocSnap>;
  getSnapshotDoc(): Promise<FinanceFr1ApplyDocSnap>;
  getIdempotencyDoc(): Promise<FinanceFr1ApplyDocSnap>;
  getOrderDoc(): Promise<FinanceFr1ApplyDocSnap>;
  getAuditDoc(id: string): Promise<FinanceFr1ApplyDocSnap>;
  /** Create-only accounting snapshot. */
  createSnapshotDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr1ApplyCreateResult>;
  /** Create-only audit event (intent or result). */
  createAuditDoc(
    id: string,
    data: Record<string, unknown>,
  ): Promise<FinanceFr1ApplyCreateResult>;
  /** Create-only FR1 pilot idempotency. */
  createIdempotencyDoc(
    data: Record<string, unknown>,
  ): Promise<FinanceFr1ApplyCreateResult>;
  counter: FinanceFr1ApplyWriteCounter;
};

export type FinanceFr1ApplyActor = {
  uid: string;
  role: string;
  permissions: string[];
};

export type FinanceFr1ApplyActorResolver = {
  resolve(token: string): Promise<
    | { ok: true; actor: FinanceFr1ApplyActor }
    | { ok: false; reason: string }
  >;
};

export function createFakeFinanceFr1ApplyFirestorePort(seed?: {
  registry?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  audits?: Record<string, Record<string, unknown>>;
}): FinanceFr1ApplyFirestorePort & {
  setRegistry(data: Record<string, unknown> | null): void;
  setSnapshot(data: Record<string, unknown> | null): void;
  setIdempotency(data: Record<string, unknown> | null): void;
  setOrder(data: Record<string, unknown> | null): void;
} {
  let registry: Record<string, unknown> | null = seed?.registry ?? null;
  let snapshot: Record<string, unknown> | null = seed?.snapshot ?? null;
  let idempotency: Record<string, unknown> | null = seed?.idempotency ?? null;
  let order: Record<string, unknown> | null = seed?.order ?? null;
  const audits = new Map<string, Record<string, unknown>>(
    Object.entries(seed?.audits ?? {}),
  );
  const counter = createFinanceFr1ApplyWriteCounter();

  return {
    counter,
    setRegistry(data) {
      registry = data;
    },
    setSnapshot(data) {
      snapshot = data;
    },
    setIdempotency(data) {
      idempotency = data;
    },
    setOrder(data) {
      order = data;
    },
    async getRegistryDoc() {
      counter.productionReads += 1;
      return { exists: registry != null, data: registry };
    },
    async getSnapshotDoc() {
      counter.productionReads += 1;
      return { exists: snapshot != null, data: snapshot };
    },
    async getIdempotencyDoc() {
      counter.productionReads += 1;
      return { exists: idempotency != null, data: idempotency };
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
    async createSnapshotDoc(data) {
      if (snapshot != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "snapshot already exists",
        };
      }
      snapshot = { ...data };
      counter.snapshotWrites += 1;
      return { ok: true, id: FINANCE_FR1_SYNTHETIC_ORDER_ID };
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
      if (data.action === "snapshot.materialize.intent") {
        counter.auditIntentWrites += 1;
      } else if (data.action === "snapshot.materialize.result") {
        counter.auditResultWrites += 1;
      }
      return { ok: true, id };
    },
    async createIdempotencyDoc(data) {
      if (idempotency != null) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "idempotency already exists",
        };
      }
      idempotency = { ...data };
      counter.idempotencyWrites += 1;
      return { ok: true, id: FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID };
    },
  };
}

export const FINANCE_FR1_APPLY_COLLECTION_PATHS = {
  registry: `${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID}`,
  snapshot: `${FINANCE_FR1_SNAPSHOT_COLLECTION}/${FINANCE_FR1_SYNTHETIC_ORDER_ID}`,
  idempotency: `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/${FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID}`,
  auditCollection: FINANCE_FR1_AUDIT_COLLECTION,
  order: `order/${FINANCE_FR1_SYNTHETIC_ORDER_ID}`,
} as const;

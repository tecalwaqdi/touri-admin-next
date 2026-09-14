/**
 * ADC read-only Production ports for Finance shadow.
 * GET / query only. No writes. SA JSON keys forbidden.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { PHASE_FINANCE_SHADOW_EXPECTED_PROJECT_ID } from "@/domain/finance/shadow/isPhaseFinanceShadowEnabled";
import type {
  ProductionOrderReadInput,
  ProductionSettlementReadInput,
} from "@/adapters/finance/ProductionFinanceReadAdapter";

export type FinanceShadowReadCounter = { productionReads: number };

export class FinanceShadowPortsUnreachableError extends Error {
  readonly code = "FINANCE_SHADOW_PORTS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceShadowPortsUnreachableError";
  }
}

export type FinanceShadowProductionSnapshot = {
  orders: ProductionOrderReadInput[];
  settlements: ProductionSettlementReadInput[];
  countriesWithMultipleActiveAgents: number;
  productionReads: number;
  collectionsQueried: string[];
};

function asRecord(data: Record<string, unknown>): Record<string, unknown> {
  return data;
}

/**
 * Create ADC Admin app and load bounded order + settlement windows.
 */
export async function loadFinanceShadowProductionSnapshot(input?: {
  projectId?: string;
  orderLimit?: number;
  settlementLimit?: number;
  agentLimit?: number;
}): Promise<FinanceShadowProductionSnapshot> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new FinanceShadowPortsUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_FINANCE_SHADOW_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceShadowPortsUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = "finance-shadow-readonly";
  const existing = admin.apps.find((a) => a?.name === appName);
  const app =
    existing ??
    admin.initializeApp(
      {
        credential: admin.credential.applicationDefault(),
        projectId,
      },
      appName,
    );

  const db = app.firestore();
  let productionReads = 0;
  const collectionsQueried: string[] = [];

  const orderLimit = Math.min(input?.orderLimit ?? 50, 50);
  const settlementLimit = Math.min(input?.settlementLimit ?? 50, 50);
  const agentLimit = Math.min(input?.agentLimit ?? 50, 50);

  // Prefer completed orders for item 1; fall back to latest page if empty.
  collectionsQueried.push("order");
  let orderSnap = await db
    .collection("order")
    .where("status_code", "==", "completed")
    .limit(orderLimit)
    .get();
  productionReads += 1;
  if (orderSnap.empty) {
    orderSnap = await db
      .collection("order")
      .orderBy("data_order", "desc")
      .limit(orderLimit)
      .get();
    productionReads += 1;
  }

  const orders: ProductionOrderReadInput[] = orderSnap.docs.map((d) => ({
    documentId: d.id,
    data: asRecord(d.data() as Record<string, unknown>),
  }));

  collectionsQueried.push("financial_settlements");
  const settlementSnap = await db
    .collection("financial_settlements")
    .limit(settlementLimit)
    .get();
  productionReads += 1;
  const settlements: ProductionSettlementReadInput[] = settlementSnap.docs.map(
    (d) => ({
      documentId: d.id,
      data: asRecord(d.data() as Record<string, unknown>),
    }),
  );

  // ONE COUNTRY = MAX ONE ACTIVE AGENT diagnostic (sample).
  collectionsQueried.push("user");
  let countriesWithMultipleActiveAgents = 0;
  try {
    const agentsSnap = await db
      .collection("user")
      .where("Isagent", "==", true)
      .limit(agentLimit)
      .get();
    productionReads += 1;
    const activeByCountry = new Map<string, number>();
    for (const d of agentsSnap.docs) {
      const x = d.data() as Record<string, unknown>;
      const active =
        x.actev_agent === true ||
        x.active_agent === true ||
        x.IsActive === true ||
        x.active === true;
      if (!active) continue;
      const countryRef = x.Rev_dloh_agent as { path?: string } | string | null;
      const country =
        typeof countryRef === "string"
          ? countryRef
          : typeof countryRef?.path === "string"
            ? countryRef.path
            : typeof x.country_id === "string"
              ? x.country_id
              : "unknown";
      activeByCountry.set(country, (activeByCountry.get(country) ?? 0) + 1);
    }
    for (const n of activeByCountry.values()) {
      if (n > 1) countriesWithMultipleActiveAgents += 1;
    }
  } catch {
    // Index/permission — leave 0 and let validator mark scope sample incomplete elsewhere.
  }

  return {
    orders,
    settlements,
    countriesWithMultipleActiveAgents,
    productionReads,
    collectionsQueried,
  };
}

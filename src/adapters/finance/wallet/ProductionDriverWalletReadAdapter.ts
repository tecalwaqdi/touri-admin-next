/**
 * Production RO driver wallet adapter — wallets + transactions via WIF-native read.
 * No writes. missing ≠ 0. Bounded queries only.
 */

import {
  DRIVER_WALLET_RO_QUERY_LIMIT,
  type DriverWalletListQuery,
  type DriverWalletListResult,
  type DriverWalletReadPort,
} from "@/adapters/finance/wallet/DriverWalletReadPorts";
import {
  mapLegacyTransactionDoc,
  mapLegacyWalletDoc,
  type DriverWalletDetail,
} from "@/domain/finance/wallet/DriverWalletReadModels";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { createWifNativeFirestoreRead } from "@/infrastructure/production/firestore/createWifNativeFirestoreReadTransport";
import { FINANCE_FR7_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr7PilotConstants";

export class ProductionDriverWalletReadAdapter implements DriverWalletReadPort {
  constructor(private readonly client: FirestoreReadClient) {}

  async list(query?: DriverWalletListQuery): Promise<DriverWalletListResult> {
    const limit = Math.min(
      query?.limit ?? DRIVER_WALLET_RO_QUERY_LIMIT,
      DRIVER_WALLET_RO_QUERY_LIMIT,
    );
    const filters = [];
    if (query?.driverId) {
      filters.push({ field: "driverId", op: "==" as const, value: query.driverId });
    }
    const result = await this.client.query({
      collection: "wallets",
      filters: filters.length ? filters : undefined,
      orderBy: [{ field: "__name__", direction: "asc" }],
      limit,
    });
    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => mapLegacyWalletDoc({ id: d.id, data: d.data! }));
    if (query?.countryId) {
      items = items.filter((w) => w.countryId === query.countryId);
    }
    const warnings: string[] = ["bounded_wallet_window"];
    if (items.length === 0) warnings.push("no_wallet_records");
    return {
      items,
      nextCursor: result.nextCursor,
      productionReads: result.docs.length,
      productionWrites: 0,
      warnings,
      mode: "production_read_only",
    };
  }

  async getById(walletId: string): Promise<DriverWalletDetail | null> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(walletId)) {
      throw new Error("validation_failed:invalid wallet id");
    }
    const doc = await this.client.getDocument("wallets", walletId);
    if (!doc.exists || !doc.data) return null;
    const wallet = mapLegacyWalletDoc({ id: doc.id, data: doc.data });
    const tx = await this.client.query({
      collection: "transactions",
      filters: [{ field: "walletId", op: "==", value: walletId }],
      orderBy: [{ field: "__name__", direction: "desc" }],
      limit: DRIVER_WALLET_RO_QUERY_LIMIT,
    });
    const ledger = tx.docs
      .filter((d) => d.exists && d.data)
      .map((d) => mapLegacyTransactionDoc({ id: d.id, data: d.data! }));
    return {
      wallet,
      ledger,
      ledgerBounded: true,
      warnings: ["bounded_ledger_window"],
    };
  }
}

export async function createProductionDriverWalletReadAdapter(input?: {
  projectId?: string;
  client?: FirestoreReadClient;
}): Promise<ProductionDriverWalletReadAdapter> {
  if (input?.client) {
    return new ProductionDriverWalletReadAdapter(input.client);
  }
  const projectId = input?.projectId ?? FINANCE_FR7_EXPECTED_PROJECT_ID;
  const { client } = await createWifNativeFirestoreRead({
    projectId,
    requireWif: process.env.VERCEL === "1",
  });
  return new ProductionDriverWalletReadAdapter(client);
}

/**
 * Application service — driver wallet RO. finance:read RBAC at API layer.
 */

import type {
  DriverWalletListQuery,
  DriverWalletListResult,
  DriverWalletReadPort,
} from "@/adapters/finance/wallet/DriverWalletReadPorts";
import type { DriverWalletDetail } from "@/domain/finance/wallet/DriverWalletReadModels";
import { createProductionDriverWalletReadAdapter } from "@/adapters/finance/wallet/ProductionDriverWalletReadAdapter";
import { FakeDriverWalletReadAdapter } from "@/adapters/finance/wallet/FakeDriverWalletReadAdapter";
import { productionReadPathActive } from "@/infrastructure/http/shadowApi";

export class DriverWalletReadService {
  constructor(private readonly port: DriverWalletReadPort) {}

  list(query?: DriverWalletListQuery): Promise<DriverWalletListResult> {
    return this.port.list(query);
  }

  getById(walletId: string): Promise<DriverWalletDetail | null> {
    return this.port.getById(walletId);
  }
}

let cached: DriverWalletReadService | null = null;

export async function getDriverWalletReadService(): Promise<DriverWalletReadService> {
  if (cached) return cached;
  if (productionReadPathActive()) {
    cached = new DriverWalletReadService(
      await createProductionDriverWalletReadAdapter(),
    );
  } else {
    cached = new DriverWalletReadService(new FakeDriverWalletReadAdapter());
  }
  return cached;
}

/** Test hook. */
export function setDriverWalletReadServiceForTests(
  service: DriverWalletReadService | null,
): void {
  cached = service;
}

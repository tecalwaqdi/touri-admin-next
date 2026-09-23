/**
 * Driver wallet read port — RO only. No Fake balances invented as 0.
 */

import type {
  DriverWalletDetail,
  DriverWalletListItem,
} from "@/domain/finance/wallet/DriverWalletReadModels";

export const DRIVER_WALLET_RO_COLLECTIONS = ["wallets", "transactions"] as const;

export const DRIVER_WALLET_RO_QUERY_LIMIT = 50 as const;

export type DriverWalletListQuery = {
  countryId?: string | null;
  driverId?: string | null;
  limit?: number;
};

export type DriverWalletListResult = {
  items: DriverWalletListItem[];
  nextCursor: string | null;
  productionReads: number;
  productionWrites: 0;
  warnings: string[];
  mode: "production_read_only" | "offline_fake";
};

export interface DriverWalletReadPort {
  list(query?: DriverWalletListQuery): Promise<DriverWalletListResult>;
  getById(walletId: string): Promise<DriverWalletDetail | null>;
}

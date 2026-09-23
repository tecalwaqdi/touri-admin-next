/**
 * Offline Fake driver wallet read adapter — explicit fixtures only.
 * Missing balances stay null / missing (never invent 0).
 */

import type { DriverWalletReadPort, DriverWalletListQuery, DriverWalletListResult } from "@/adapters/finance/wallet/DriverWalletReadPorts";
import type {
  DriverWalletDetail,
  DriverWalletListItem,
  DriverWalletLedgerEntry,
} from "@/domain/finance/wallet/DriverWalletReadModels";

export class FakeDriverWalletReadAdapter implements DriverWalletReadPort {
  constructor(
    private readonly wallets: DriverWalletListItem[] = [],
    private readonly ledgerByWallet: Record<string, DriverWalletLedgerEntry[]> = {},
  ) {}

  async list(query?: DriverWalletListQuery): Promise<DriverWalletListResult> {
    let items = [...this.wallets];
    if (query?.countryId) {
      items = items.filter((w) => w.countryId === query.countryId);
    }
    if (query?.driverId) {
      items = items.filter((w) => w.driverId === query.driverId);
    }
    const limit = Math.min(query?.limit ?? 50, 50);
    return {
      items: items.slice(0, limit),
      nextCursor: null,
      productionReads: 0,
      productionWrites: 0,
      warnings: items.length === 0 ? ["no_wallet_records"] : [],
      mode: "offline_fake",
    };
  }

  async getById(walletId: string): Promise<DriverWalletDetail | null> {
    const wallet = this.wallets.find((w) => w.walletId === walletId);
    if (!wallet) return null;
    return {
      wallet,
      ledger: this.ledgerByWallet[walletId] ?? [],
      ledgerBounded: true,
      warnings: [],
    };
  }
}

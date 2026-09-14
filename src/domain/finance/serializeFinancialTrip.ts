import type { FinancialTrip } from "@/domain/finance/FinancialTrip";
import { moneySnapshot } from "@/domain/finance/FinancialTrip";

export type FinancialTripDto = Omit<FinancialTrip, "amounts"> & {
  amounts: {
    grossFare: { amountMinor: string; currency: string } | null;
    cashCollected: { amountMinor: string; currency: string } | null;
    onlineCollected: { amountMinor: string; currency: string } | null;
    platformCommission: { amountMinor: string; currency: string } | null;
    agentCommission: { amountMinor: string; currency: string } | null;
    driverEarnings: { amountMinor: string; currency: string } | null;
    vatAmount: { amountMinor: string; currency: string } | null;
    refundAmount: { amountMinor: string; currency: string } | null;
    gatewayFee: { amountMinor: string; currency: string } | null;
  };
};

export function toFinancialTripDto(ft: FinancialTrip): FinancialTripDto {
  return {
    ...ft,
    amounts: {
      grossFare: moneySnapshot(ft.amounts.grossFare),
      cashCollected: moneySnapshot(ft.amounts.cashCollected),
      onlineCollected: moneySnapshot(ft.amounts.onlineCollected),
      platformCommission: moneySnapshot(ft.amounts.platformCommission),
      agentCommission: moneySnapshot(ft.amounts.agentCommission),
      driverEarnings: moneySnapshot(ft.amounts.driverEarnings),
      vatAmount: moneySnapshot(ft.amounts.vatAmount),
      refundAmount: moneySnapshot(ft.amounts.refundAmount),
      gatewayFee: moneySnapshot(ft.amounts.gatewayFee),
    },
  };
}

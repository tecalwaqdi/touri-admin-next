import type { FinanceSummaryPlaceholder } from "@/types/finance";

export interface FinanceRepository {
  getDashboardFinancePlaceholder(): Promise<FinanceSummaryPlaceholder>;
}

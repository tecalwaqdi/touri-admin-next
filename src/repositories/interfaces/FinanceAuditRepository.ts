import type { FinanceAuditEvent } from "@/domain/finance/v2/FinanceImplementationContracts";

export interface FinanceAuditRepository {
  append(event: FinanceAuditEvent): Promise<void>;
  listByResource(
    resourceType: string,
    resourceId: string,
  ): Promise<FinanceAuditEvent[]>;
}

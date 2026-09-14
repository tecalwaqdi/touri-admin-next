import type { FinanceAuditEvent } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinanceAuditRepository } from "@/repositories/interfaces/FinanceAuditRepository";

export class FakeFinanceAuditRepository implements FinanceAuditRepository {
  private readonly events: FinanceAuditEvent[] = [];

  async append(event: FinanceAuditEvent): Promise<void> {
    // Append-only — no update/delete.
    this.events.push({ ...event });
  }

  async listByResource(
    resourceType: string,
    resourceId: string,
  ): Promise<FinanceAuditEvent[]> {
    return this.events.filter(
      (e) => e.resourceType === resourceType && e.resourceId === resourceId,
    );
  }

  all(): FinanceAuditEvent[] {
    return [...this.events];
  }
}

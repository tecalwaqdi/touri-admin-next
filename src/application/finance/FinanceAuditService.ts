/**
 * Finance audit service — append-only events.
 */

import type { FinanceAuditEvent } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinanceAuditRepository } from "@/repositories/interfaces/FinanceAuditRepository";

export class FinanceAuditService {
  constructor(private readonly repo: FinanceAuditRepository) {}

  async record(event: Omit<FinanceAuditEvent, "id" | "atUtc"> & { id?: string }): Promise<FinanceAuditEvent> {
    const full: FinanceAuditEvent = {
      id: event.id ?? `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      atUtc: new Date().toISOString(),
      actorUserId: event.actorUserId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey,
      reason: event.reason,
    };
    await this.repo.append(full);
    return full;
  }

  async list(resourceType: string, resourceId: string): Promise<FinanceAuditEvent[]> {
    return this.repo.listByResource(resourceType, resourceId);
  }
}

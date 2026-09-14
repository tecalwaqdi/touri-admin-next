import type { AuditEvent } from "@/types/audit";
import type { AuditListParams, AuditRepository } from "@/repositories/interfaces/AuditRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedAuditEvents } from "@/test/fixtures/seed";

export class InMemoryAuditRepository implements AuditRepository {
  private events: AuditEvent[];

  constructor(initial: AuditEvent[] = seedAuditEvents.map((e) => structuredClone(e))) {
    this.events = initial;
  }

  async append(event: AuditEvent): Promise<void> {
    this.events = [event, ...this.events];
  }

  async list(limit = 100): Promise<AuditEvent[]> {
    return this.events.slice(0, limit);
  }

  async getById(auditId: string) {
    return this.events.find((e) => e.auditId === auditId) ?? null;
  }

  async query(params: AuditListParams) {
    let filtered = [...this.events];
    if (params.actorUserId) {
      filtered = filtered.filter((e) => e.actorUserId === params.actorUserId);
    }
    if (params.action) {
      filtered = filtered.filter((e) => e.action === params.action);
    }
    if (params.resourceType) {
      filtered = filtered.filter((e) => e.resourceType === params.resourceType);
    }
    if (params.environment) {
      filtered = filtered.filter((e) => e.environment === params.environment);
    }
    if (params.fromUtc) {
      filtered = filtered.filter((e) => e.createdAtUtc >= params.fromUtc!);
    }
    if (params.toUtc) {
      filtered = filtered.filter((e) => e.createdAtUtc <= params.toUtc!);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.auditId.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.correlationId.toLowerCase().includes(q) ||
          (e.resourceId ?? "").toLowerCase().includes(q),
      );
    }
    return paginate(filtered, params.page, params.pageSize);
  }

  clear() {
    this.events = [];
  }

  resetToSeed() {
    this.events = seedAuditEvents.map((e) => structuredClone(e));
  }
}

export const sharedAuditRepository = new InMemoryAuditRepository();

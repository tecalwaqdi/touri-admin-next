import type { AuditEvent } from "@/types/audit";
import type { AuditRepository } from "@/repositories/interfaces/AuditRepository";
import { createAuditId } from "@/lib/ids";
import { getEnv } from "@/config/env";

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(input: Omit<AuditEvent, "auditId" | "createdAtUtc" | "environment"> & {
    environment?: string;
  }): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      auditId: createAuditId(),
      environment: input.environment ?? getEnv().APP_ENV,
      createdAtUtc: new Date().toISOString(),
    };
    await this.repo.append(event);
    return event;
  }

  async list(limit = 50): Promise<AuditEvent[]> {
    return this.repo.list(limit);
  }
}

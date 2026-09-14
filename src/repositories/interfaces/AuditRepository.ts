import type { AuditEvent } from "@/types/audit";

export type AuditListParams = {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  environment?: string;
  fromUtc?: string;
  toUtc?: string;
  page?: number;
  pageSize?: number;
  search?: string;
};

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  list(limit?: number): Promise<AuditEvent[]>;
  query(params: AuditListParams): Promise<{
    items: AuditEvent[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  getById(auditId: string): Promise<AuditEvent | null>;
}

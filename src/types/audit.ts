export type AuditEvent = {
  auditId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  reason?: string;
  environment: string;
  ipHashOrSafeNetworkId?: string;
  userAgent?: string;
  createdAtUtc: string;
  correlationId: string;
};

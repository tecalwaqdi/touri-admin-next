/**
 * PC-4 — AdminAuditReadService — Production RO via admin_next_cw_audit + WIF.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { FirebaseProductionAdminAuditReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminAuditReadRepository";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";
import type { AuditEvent } from "@/types/audit";

export class AdminAuditSourceUnavailableError extends Error {
  readonly code = "PRODUCTION_AUDIT_SOURCE_UNAVAILABLE";
  constructor(message = "Production audit source unavailable") {
    super(message);
    this.name = "AdminAuditSourceUnavailableError";
  }
}

export class AdminAuditNotFoundError extends Error {
  readonly code = "AUDIT_EVENT_NOT_FOUND";
  constructor(readonly auditId: string) {
    super(`Audit event not found: ${auditId}`);
    this.name = "AdminAuditNotFoundError";
  }
}

export type AdminAuditListResponse = {
  items: AuditEvent[];
  total: number;
  pageSize: number;
  nextCursor: string | null;
  truncated: boolean;
  filterScope: "loaded_page";
  unavailable: false;
  synthetic: false;
  sourceLabel: ReturnType<typeof resolveAdminDataSourceLabel>;
  sourceEnvironment: "production";
  sourceSystem: "admin_next_cw_audit";
  transport: "wif_native";
  financeAuditMerged: false;
  auditKind: typeof PRODUCTION_ADMIN_AUDIT_SOURCE.kind;
};

export async function listProductionAdminAudit(
  _ctx: ApiActorContext,
  query: {
    pageSize?: number;
    cursor?: string | null;
    actorUserId?: string;
    action?: string;
    resourceType?: string;
    environment?: string;
  },
): Promise<AdminAuditListResponse> {
  if (!isProductionOperationalReadArmed()) {
    throw new AdminAuditSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  const repo = new FirebaseProductionAdminAuditReadRepository(runtime.client);
  const pageSize =
    query.pageSize ?? PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize;
  const result = await repo.list({
    pageSize,
    cursor: query.cursor,
    actorUserId: query.actorUserId,
    action: query.action,
    resourceType: query.resourceType,
    environment: query.environment,
  });
  const sourceLabel = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: result.items.map((i) => i.auditId),
  });
  return {
    items: result.items,
    total: result.items.length,
    pageSize: result.pageSize,
    nextCursor: result.nextCursor,
    truncated: result.truncated,
    filterScope: result.filterScope,
    unavailable: false,
    synthetic: false,
    sourceLabel,
    sourceEnvironment: "production",
    sourceSystem: "admin_next_cw_audit",
    transport: "wif_native",
    financeAuditMerged: false,
    auditKind: PRODUCTION_ADMIN_AUDIT_SOURCE.kind,
  };
}

export async function getProductionAdminAuditDetail(
  _ctx: ApiActorContext,
  auditId: string,
): Promise<AuditEvent & { synthetic: false; transport: "wif_native" }> {
  if (!isProductionOperationalReadArmed()) {
    throw new AdminAuditSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  const repo = new FirebaseProductionAdminAuditReadRepository(runtime.client);
  const event = await repo.getById(auditId);
  if (!event) throw new AdminAuditNotFoundError(auditId);
  return { ...event, synthetic: false, transport: "wif_native" };
}

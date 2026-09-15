import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { FirebaseProductionSupportReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionSupportReadRepository";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import type {
  SupportTicketDetail,
  SupportTicketListItem,
} from "@/domain/support/SupportTicketMapping";
import { enforceLiveShadowResource } from "@/infrastructure/production/repositories/productionReadHelpers";

export class SupportSourceUnavailableError extends Error {
  readonly code = "SUPPORT_SOURCE_UNAVAILABLE";
  constructor(message = "Support source unavailable") {
    super(message);
    this.name = "SupportSourceUnavailableError";
  }
}

export async function listProductionSupportTickets(ctx: ApiActorContext): Promise<{
  items: SupportTicketListItem[];
  truncated: boolean;
  sourceLabel: ReturnType<typeof resolveAdminDataSourceLabel>;
}> {
  if (!isProductionOperationalReadArmed()) {
    throw new SupportSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  enforceLiveShadowResource(runtime.liveShadowAllowedResources, "support");
  const repo = new FirebaseProductionSupportReadRepository(runtime.client);
  const result = await repo.list({ scope: ctx.user.scope });
  return {
    ...result,
    sourceLabel: resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: result.items.map((i) => i.id),
    }),
  };
}

export async function getProductionSupportTicket(
  ctx: ApiActorContext,
  id: string,
): Promise<SupportTicketDetail> {
  if (!isProductionOperationalReadArmed()) {
    throw new SupportSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  enforceLiveShadowResource(runtime.liveShadowAllowedResources, "support");
  const repo = new FirebaseProductionSupportReadRepository(runtime.client);
  const detail = await repo.getById({ id, scope: ctx.user.scope });
  if (!detail) {
    throw Object.assign(new Error("Support ticket not found"), {
      code: "SUPPORT_NOT_FOUND",
    });
  }
  return detail;
}

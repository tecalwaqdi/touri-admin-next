/**
 * Production Support write precondition loader — WIF REST on `support/{id}`.
 */

import type { SupportWriteLoadPort } from "@/application/controlled-writes/support/SupportControlledWriteService";
import type { SupportWriteSnapshot } from "@/application/controlled-writes/support/SupportWriteTypes";
import { mapSupportDocumentToDetail } from "@/domain/support/SupportTicketMapping";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function displayStatusFromStatus(
  status: SupportWriteSnapshot["status"],
): SupportWriteSnapshot["displayStatus"] {
  switch (status) {
    case "open":
      return "open";
    case "in_progress":
      return "in_progress";
    case "resolved":
      return "resolved";
    case "closed":
      return "closed";
    default:
      return "open";
  }
}

function preconditionTokenFromSnap(
  updateTime: string | null,
  ticketId: string,
): string {
  if (updateTime) return `fs_ut_${updateTime}`;
  return `fs_exists_${ticketId.slice(0, 8)}`;
}

export class ProductionSupportWriteLoadPort implements SupportWriteLoadPort {
  readonly kind = "production_support_write_load" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async load(ticketId: string): Promise<SupportWriteSnapshot | null> {
    const snap = await this.port.getDocument("support", ticketId);
    if (!snap.exists || !snap.data) return null;
    const detail = mapSupportDocumentToDetail({
      id: ticketId,
      data: snap.data,
    });
    const status = detail.status === "unknown" ? "open" : detail.status;
    return {
      exists: true,
      ticketId,
      status,
      displayStatus: displayStatusFromStatus(status),
      countryId: detail.countryId,
      assignedAdminId: detail.assignedAdminId,
      category: detail.category,
      priority: detail.priority,
      isDriverSchema: Boolean(detail.driverId),
      preconditionToken: preconditionTokenFromSnap(snap.updateTime, ticketId),
    };
  }
}

export function createProductionSupportWriteLoadPort(
  port?: ProductionFirestoreWritePort,
): ProductionSupportWriteLoadPort {
  return new ProductionSupportWriteLoadPort(
    port ?? createWifWritePortOrThrow("ops_writer"),
  );
}

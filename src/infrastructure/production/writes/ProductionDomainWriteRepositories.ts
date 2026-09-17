/**
 * REAL Production writers for geography, P0 catalog, support, notifications, identity.
 * Env gates default FALSE. Fake remains offline/test only.
 */

import {
  assertGeographyProductionWriteEnabled,
  type GeographyWriteCommand,
  type GeographyWriteFlagGate,
  type GeographyResource,
} from "@/application/controlled-writes/geography/GeographyControlledWriteService";
import {
  assertP0ProductionWriteEnabled,
  type P0WriteDomain,
  type P0WriteFlagGate,
} from "@/application/controlled-writes/P0WriteGates";
import type { P0MasterWriteCommand } from "@/application/controlled-writes/P0MasterControlledWriteService";
import {
  assertSupportProductionWriteEnabled,
} from "@/application/controlled-writes/support/SupportWriteFlags";
import type { SupportWriteFlagGate } from "@/application/controlled-writes/support/SupportWriteTypes";
import type { SupportWriteRepository } from "@/application/controlled-writes/support/SupportWriteRepository";
import {
  assertNotificationProductionWriteEnabled,
} from "@/application/controlled-writes/notifications/NotificationWriteFlags";
import type { NotificationWriteFlagGate } from "@/application/controlled-writes/notifications/NotificationWriteTypes";
import { resolveWritePrincipal } from "@/infrastructure/production/writes/ProductionWritePrincipals";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

const GEO_COLLECTION: Record<GeographyResource, string> = {
  country: "countries",
  region: "cities",
  city: "villages",
  landmark: "mkan",
};

const P0_COLLECTION: Record<P0WriteDomain, string> = {
  region: "cities",
  vehicle_catalog: "type_car",
  partner: "mkan",
  fleet: "transport_company",
  guide: "user",
};

function requirePort(
  port: ProductionFirestoreWritePort | undefined,
  principal: "ops_writer",
): ProductionFirestoreWritePort {
  if (port) return port;
  const resolved = resolveWritePrincipal(principal);
  if (!resolved.ready) {
    throw Object.assign(
      new Error(`WRITE_RUNTIME_UNAVAILABLE:${resolved.reason}`),
      { code: "WRITE_RUNTIME_UNAVAILABLE" },
    );
  }
  return createWifWritePortOrThrow(principal);
}

export class ProductionGeographyWriteRepository {
  readonly kind = "production_geography_write" as const;
  constructor(
    private readonly flags: GeographyWriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async apply(command: GeographyWriteCommand): Promise<{
    productionWriteExecuted: true;
    preconditionToken: string;
  }> {
    assertGeographyProductionWriteEnabled(this.flags, command.resource);
    const port = requirePort(this.port, "ops_writer");
    const collection = GEO_COLLECTION[command.resource];
    const patch: Record<string, unknown> = { ...(command.metadata ?? {}) };
    if (command.action === "activate") patch.active = true;
    if (command.action === "deactivate") patch.active = false;
    if (command.action === "archive") {
      patch.archived = true;
      patch.active = false;
    }
    if (command.action === "create") {
      const created = await port.createDocument(collection, command.resourceId, {
        ...patch,
        active: true,
        archived: false,
      });
      return {
        productionWriteExecuted: true,
        preconditionToken: created.updateTime
          ? `fs_ut_${created.updateTime}`
          : `fs_new_${command.resourceId.slice(0, 8)}`,
      };
    }
    const expectedUt = command.preconditionToken.startsWith("fs_ut_")
      ? command.preconditionToken.slice("fs_ut_".length)
      : undefined;
    const updated = await port.updateDocument(
      collection,
      command.resourceId,
      patch,
      { expectedUpdateTime: expectedUt ?? null },
    );
    return {
      productionWriteExecuted: true,
      preconditionToken: updated.updateTime
        ? `fs_ut_${updated.updateTime}`
        : command.preconditionToken,
    };
  }
}

export class ProductionP0MasterWriteRepository {
  readonly kind = "production_p0_master_write" as const;
  constructor(
    private readonly domain: P0WriteDomain,
    private readonly flags: P0WriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async apply(command: P0MasterWriteCommand): Promise<{
    productionWriteExecuted: true;
    preconditionToken: string;
  }> {
    assertP0ProductionWriteEnabled(this.domain, this.flags);
    const port = requirePort(this.port, "ops_writer");
    const collection = P0_COLLECTION[command.domain];
    const patch: Record<string, unknown> = { ...(command.metadata ?? {}) };
    if (command.domain === "partner") patch.isShrek = true;
    if (command.domain === "guide") patch.is_tour_guide = true;
    if (command.action === "activate") patch.active = true;
    if (command.action === "deactivate") patch.active = false;
    if (command.action === "archive") {
      patch.archived = true;
      patch.active = false;
    }
    if (command.action === "create") {
      const created = await port.createDocument(collection, command.resourceId, {
        ...patch,
        active: true,
        archived: false,
      });
      return {
        productionWriteExecuted: true,
        preconditionToken: created.updateTime
          ? `fs_ut_${created.updateTime}`
          : `p0_${command.resourceId.slice(0, 8)}`,
      };
    }
    const expectedUt = command.preconditionToken.startsWith("fs_ut_")
      ? command.preconditionToken.slice("fs_ut_".length)
      : undefined;
    const updated = await port.updateDocument(
      collection,
      command.resourceId,
      patch,
      { expectedUpdateTime: expectedUt ?? null },
    );
    return {
      productionWriteExecuted: true,
      preconditionToken: updated.updateTime
        ? `fs_ut_${updated.updateTime}`
        : command.preconditionToken,
    };
  }
}

export class ProductionSupportWriteRepository implements SupportWriteRepository {
  readonly kind = "production_support_write" as const;
  constructor(
    private readonly flags: SupportWriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async applyPatch(input: {
    ticketId: string;
    patch: Record<string, unknown>;
    preconditionToken: string;
  }) {
    assertSupportProductionWriteEnabled(this.flags);
    const port = requirePort(this.port, "ops_writer");
    const expectedUt = input.preconditionToken.startsWith("fs_ut_")
      ? input.preconditionToken.slice("fs_ut_".length)
      : undefined;
    await port.updateDocument("support", input.ticketId, input.patch, {
      expectedUpdateTime: expectedUt ?? null,
    });
    return { applied: true, patchKeys: Object.keys(input.patch) };
  }
}

export class ProductionNotificationWriteRepository {
  readonly kind = "production_notification_write" as const;
  constructor(
    private readonly flags: NotificationWriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async applyPanelPatch(input: {
    notificationId: string;
    patch: Record<string, unknown>;
    preconditionToken: string;
    create?: boolean;
  }) {
    assertNotificationProductionWriteEnabled(this.flags);
    // Never accept client FCM tokens.
    if ("fcmToken" in input.patch || "fcmTokens" in input.patch) {
      throw Object.assign(new Error("VALIDATION_FAILED"), {
        code: "VALIDATION_FAILED",
      });
    }
    const port = requirePort(this.port, "ops_writer");
    if (input.create) {
      await port.createDocument(
        "admin_panel_notifications",
        input.notificationId,
        input.patch,
      );
      return { applied: true, patchKeys: Object.keys(input.patch) };
    }
    const expectedUt = input.preconditionToken.startsWith("fs_ut_")
      ? input.preconditionToken.slice("fs_ut_".length)
      : undefined;
    await port.updateDocument(
      "admin_panel_notifications",
      input.notificationId,
      input.patch,
      { expectedUpdateTime: expectedUt ?? null },
    );
    return { applied: true, patchKeys: Object.keys(input.patch) };
  }
}


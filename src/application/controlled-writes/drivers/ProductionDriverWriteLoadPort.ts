/**
 * Production Driver write precondition loader — WIF REST getDocument on `user/{uid}`.
 * Used only when DRIVER production writes are armed (same driver_review principal).
 * Offline/dev continues to use BridgedDriverWriteLoadPort (in-memory).
 */

import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import type { DriverWriteSnapshot } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { toProvenDriverState } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";

function preconditionTokenFromSnap(updateTime: string | null, driverId: string): string {
  if (updateTime) return `fs_ut_${updateTime}`;
  return `fs_exists_${driverId.slice(0, 8)}`;
}

function countryIdFromDoc(data: Record<string, unknown>): {
  countryId: string | null;
  countryScopeKind: DriverWriteSnapshot["countryScopeKind"];
} {
  const raw = extractLegacyDocRefId(data.Rev_dolh);
  if (!raw) {
    return { countryId: null, countryScopeKind: "unknown" };
  }
  const resolved = resolveCanonicalCountryId(raw);
  if (resolved.status === "mapped" && resolved.canonicalCountryId) {
    return {
      countryId: resolved.canonicalCountryId,
      countryScopeKind: "mapped",
    };
  }
  return { countryId: raw, countryScopeKind: "unmapped" };
}

export class ProductionDriverWriteLoadPort implements DriverWriteLoadPort {
  readonly kind = "production_driver_write_load" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async loadForWrite(driverId: string): Promise<DriverWriteSnapshot | null> {
    const id = String(driverId || "").trim();
    if (!id) return null;

    const snap = await this.port.getDocument("user", id);
    if (!snap.exists || !snap.data) return null;

    // Shared `user` collection — only operational drivers.
    if (snap.data.ismndob !== true && snap.data.ismndom !== true) {
      return null;
    }

    const registrationStatus = toProvenDriverState(
      String(snap.data.registration_status ?? "unknown"),
    );
    const { countryId, countryScopeKind } = countryIdFromDoc(snap.data);

    return {
      driverId: id,
      exists: true,
      isOperationalDriver: true,
      registrationStatus,
      accountEnabled: snap.data.actev_mndob === true ? "enabled" : "disabled",
      complianceStatus:
        registrationStatus === "pending_review" ||
        registrationStatus === "needs_changes"
          ? "ready"
          : "unknown",
      tripState: snap.data.on_trip === true ? "busy" : "idle",
      countryId,
      countryScopeKind,
      preconditionToken: preconditionTokenFromSnap(snap.updateTime, id),
    };
  }
}

export function createProductionDriverWriteLoadPort(
  port: ProductionFirestoreWritePort,
): ProductionDriverWriteLoadPort {
  return new ProductionDriverWriteLoadPort(port);
}

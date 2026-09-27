/**
 * Load trip snapshot for cancel precondition checks.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { resolveTripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { TripWriteSnapshot } from "@/application/controlled-writes/trips/TripWriteTypes";

export type TripWriteLoadPort = {
  loadForWrite(tripId: string): Promise<TripWriteSnapshot | null>;
};

function countryFromOrder(data: Record<string, unknown>): string | null {
  const raw = data.Rev_dolh ?? data.countryId ?? data.country_id;
  const id = extractLegacyDocRefId(raw) ?? (typeof raw === "string" ? raw.trim() : null);
  if (!id) return null;
  const mapped = resolveCanonicalCountryId(id);
  return mapped.status === "mapped" ? mapped.canonicalCountryId : id;
}

function customerFromOrder(data: Record<string, unknown>): string | null {
  return (
    extractLegacyDocRefId(data.USER ?? data.customerId ?? data.user_id) ?? null
  );
}

export function snapshotFromOrderDoc(input: {
  tripId: string;
  data: Record<string, unknown>;
  updateTime: string | null;
}): TripWriteSnapshot {
  const lifecycle = resolveTripLifecycleStatus({
    status_code:
      typeof input.data.status_code === "string"
        ? input.data.status_code
        : null,
    order_status:
      typeof input.data.order_status === "string"
        ? input.data.order_status
        : null,
    status: typeof input.data.status === "string" ? input.data.status : null,
    ActiveOrder:
      typeof input.data.ActiveOrder === "boolean"
        ? input.data.ActiveOrder
        : null,
    cancelledBy:
      typeof input.data.cancelledBy === "string"
        ? input.data.cancelledBy
        : null,
    halh_text:
      typeof input.data.halh_text === "string" ? input.data.halh_text : null,
    halh_order:
      typeof input.data.halh_order === "string" ? input.data.halh_order : null,
  });
  return {
    tripId: input.tripId,
    exists: true,
    lifecycleStatus: lifecycle.status,
    countryId: countryFromOrder(input.data),
    customerId: customerFromOrder(input.data),
    preconditionToken: input.updateTime
      ? `fs_ut_${input.updateTime}`
      : `fs_exists_${input.tripId.slice(0, 8)}`,
  };
}

export class ProductionTripWriteLoadPort implements TripWriteLoadPort {
  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async loadForWrite(tripId: string): Promise<TripWriteSnapshot | null> {
    const snap = await this.port.getDocument("order", tripId);
    if (!snap.exists || !snap.data) return null;
    return snapshotFromOrderDoc({
      tripId,
      data: snap.data,
      updateTime: snap.updateTime,
    });
  }
}

export class FakeTripWriteLoadPort implements TripWriteLoadPort {
  private readonly snapshots = new Map<string, TripWriteSnapshot>();

  seed(snapshot: TripWriteSnapshot): void {
    this.snapshots.set(snapshot.tripId, { ...snapshot });
  }

  async loadForWrite(tripId: string): Promise<TripWriteSnapshot | null> {
    const s = this.snapshots.get(tripId);
    return s ? { ...s } : null;
  }
}

export function createProductionTripWriteLoadPort(
  port: ProductionFirestoreWritePort,
): ProductionTripWriteLoadPort {
  return new ProductionTripWriteLoadPort(port);
}

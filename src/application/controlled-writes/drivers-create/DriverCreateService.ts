/**
 * Driver create — Legacy `/addDrev` business capability.
 * Gated by DRIVER_WRITE_ENABLED. Writes Firestore `user` when a write port
 * is supplied; otherwise Fake/offline for local rehearsal.
 */

import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { Role } from "@/types/roles";

export type DriverCreateCommand = {
  actorUid: string;
  displayName: string;
  phoneE164: string;
  countryId: string;
  regionId?: string | null;
  vehicleTypeId?: string | null;
  freeTextVehicleType?: string | null;
  /** Affiliated transport company (fleet). Required for transport_manager. */
  transportCompanyId?: string | null;
  idempotencyKey: string;
  correlationId: string;
};

export type DriverCreateResult = {
  ok: boolean;
  code: string;
  message: string;
  productionWriteExecuted: boolean;
  driverId?: string;
  transportCompanyId?: string | null;
};

function normalizeCompanyId(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (s.includes("/")) {
    const parts = s.split("/");
    return parts[parts.length - 1] || s;
  }
  return s;
}

function normalizeCountryPath(countryId: string): string {
  const id = countryId.trim();
  if (!id) return "";
  if (id.includes("/")) return id.replace(/^\/+/, "");
  return `countries/${id}`;
}

/**
 * Enforce transport_manager may only affiliate drivers to their own company.
 * Admins may pass any company id (or omit).
 */
export function resolveAffiliatedTransportCompanyId(input: {
  requestedCompanyId?: string | null;
  actorRole: Role | string | null | undefined;
  actorTransportCompanyIds?: string[] | null;
}): { ok: true; transportCompanyId: string | null } | { ok: false; code: string; message: string } {
  const requested = normalizeCompanyId(input.requestedCompanyId);
  const allowed = (input.actorTransportCompanyIds ?? [])
    .map((id) => normalizeCompanyId(id))
    .filter((id): id is string => !!id);

  if (input.actorRole === "transport_manager") {
    if (!allowed.length) {
      return {
        ok: false,
        code: "SCOPE_DENIED",
        message: "transport_manager requires transportCompanyIds scope",
      };
    }
    if (!requested) {
      return {
        ok: true,
        transportCompanyId: allowed[0]!,
      };
    }
    if (!allowed.includes(requested)) {
      return {
        ok: false,
        code: "SCOPE_DENIED",
        message: "transport_manager cannot affiliate drivers to another company",
      };
    }
    return { ok: true, transportCompanyId: requested };
  }

  return { ok: true, transportCompanyId: requested };
}

export async function executeDriverCreate(
  command: DriverCreateCommand,
  opts?: {
    allowOfflineExecution?: boolean;
    driverWriteEnabled?: boolean;
    existingPhones?: Set<string>;
    writePort?: ProductionFirestoreWritePort | null;
    actorRole?: Role | string | null;
    actorTransportCompanyIds?: string[] | null;
  },
): Promise<DriverCreateResult> {
  if (!command.displayName.trim() || !command.phoneE164.trim() || !command.countryId.trim()) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "displayName, phoneE164, countryId required",
      productionWriteExecuted: false,
    };
  }

  const affiliation = resolveAffiliatedTransportCompanyId({
    requestedCompanyId: command.transportCompanyId,
    actorRole: opts?.actorRole,
    actorTransportCompanyIds: opts?.actorTransportCompanyIds,
  });
  if (!affiliation.ok) {
    return {
      ok: false,
      code: affiliation.code,
      message: affiliation.message,
      productionWriteExecuted: false,
    };
  }

  if (!opts?.allowOfflineExecution && !opts?.driverWriteEnabled) {
    return {
      ok: false,
      code: "PRODUCTION_WRITE_DISABLED",
      message: "DRIVER_WRITE_ENABLED required",
      productionWriteExecuted: false,
    };
  }

  if (opts?.existingPhones?.has(command.phoneE164.trim())) {
    return {
      ok: false,
      code: "DUPLICATE_IDENTITY",
      message: "Phone already registered",
      productionWriteExecuted: false,
    };
  }

  const driverId = `drv_${command.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || Date.now().toString(36)}`;
  const countryPath = normalizeCountryPath(command.countryId);
  const fields: Record<string, unknown> = {
    ismndob: true,
    display_name: command.displayName.trim(),
    phone: command.phoneE164.trim(),
    Rev_dolh: { path: countryPath },
    actev_user: true,
    admin_next_created: true,
    admin_next_correlation_id: command.correlationId,
    admin_next_idempotency_key: command.idempotencyKey,
  };
  if (command.regionId?.trim()) {
    fields.region_id = command.regionId.trim();
  }
  if (command.vehicleTypeId?.trim()) {
    fields.type_car = { path: `type_car/${command.vehicleTypeId.trim()}` };
  }
  if (command.freeTextVehicleType?.trim()) {
    fields.vehicle_type_free_text = command.freeTextVehicleType.trim();
  }
  if (affiliation.transportCompanyId) {
    fields.transport_company = {
      path: `transport_company/${affiliation.transportCompanyId}`,
    };
  }

  if (opts?.driverWriteEnabled && opts.writePort) {
    const existing = await opts.writePort.getDocument("user", driverId);
    if (existing.exists) {
      return {
        ok: true,
        code: "ALREADY_APPLIED",
        message: "Driver already created (idempotent)",
        productionWriteExecuted: false,
        driverId,
        transportCompanyId: affiliation.transportCompanyId,
      };
    }
    await opts.writePort.createDocument("user", driverId, fields);
    return {
      ok: true,
      code: "APPLIED",
      message: "Driver create applied",
      productionWriteExecuted: true,
      driverId,
      transportCompanyId: affiliation.transportCompanyId,
    };
  }

  // Offline / Fake rehearsal when gate armed without live port, or allowOfflineExecution.
  return {
    ok: true,
    code: "APPLIED",
    message: opts?.driverWriteEnabled
      ? "Driver create applied (no write port — Fake)"
      : "Driver create applied offline/Fake",
    productionWriteExecuted: false,
    driverId,
    transportCompanyId: affiliation.transportCompanyId,
  };
}

/** Doc expiry queue — read model helper. */
export type DriverDocExpiryItem = {
  driverId: string;
  slot: string;
  expiresAtUtc: string;
  daysRemaining: number;
};

export function buildDriverDocExpiryQueue(
  docs: Array<{ driverId: string; slot: string; expiresAtUtc: string }>,
  nowMs = Date.now(),
): DriverDocExpiryItem[] {
  return docs
    .map((d) => {
      const exp = Date.parse(d.expiresAtUtc);
      const daysRemaining = Number.isNaN(exp)
        ? 0
        : Math.ceil((exp - nowMs) / (24 * 60 * 60 * 1000));
      return { ...d, daysRemaining };
    })
    .filter((d) => d.daysRemaining <= 30)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

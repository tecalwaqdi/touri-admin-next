/**
 * Driver create — Legacy `/addDrev` business capability.
 * Gated by DRIVER_WRITE_ENABLED; Fake offline only in P1.
 */

export type DriverCreateCommand = {
  actorUid: string;
  displayName: string;
  phoneE164: string;
  countryId: string;
  regionId?: string | null;
  vehicleTypeId?: string | null;
  freeTextVehicleType?: string | null;
  idempotencyKey: string;
  correlationId: string;
};

export type DriverCreateResult = {
  ok: boolean;
  code: string;
  message: string;
  productionWriteExecuted: false;
  driverId?: string;
};

export function executeDriverCreate(
  command: DriverCreateCommand,
  opts?: {
    allowOfflineExecution?: boolean;
    driverWriteEnabled?: boolean;
    existingPhones?: Set<string>;
  },
): DriverCreateResult {
  if (!command.displayName.trim() || !command.phoneE164.trim() || !command.countryId.trim()) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "displayName, phoneE164, countryId required",
      productionWriteExecuted: false,
    };
  }
  if (!opts?.allowOfflineExecution && !opts?.driverWriteEnabled) {
    return {
      ok: false,
      code: "PRODUCTION_WRITE_DISABLED",
      message: "DRIVER_WRITE_ENABLED required (default false)",
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
  const driverId = `drv_${command.idempotencyKey.slice(0, 12)}`;
  return {
    ok: true,
    code: "APPLIED",
    message: "Driver create applied offline/Fake",
    productionWriteExecuted: false,
    driverId,
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

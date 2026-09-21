/**
 * Geography controlled writes — create/edit/activate/deactivate only.
 * Prefer archive/deactivate over delete. No CP5 auto-cleanup.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";

export type GeographyResource = "country" | "region" | "city" | "landmark";

export type GeographyWriteAction =
  | "create"
  | "update_metadata"
  | "activate"
  | "deactivate"
  | "archive";

export type GeographyWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  GEOGRAPHY_WRITE_ENABLED: boolean;
  /** Narrow region gate — required when resource === "region". */
  REGION_WRITE_ENABLED?: boolean;
};

export type VerifiedGeographyWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type GeographyWriteCommand = {
  actor: VerifiedGeographyWriteActor;
  resource: GeographyResource;
  resourceId: string;
  action: GeographyWriteAction;
  expectedActive: boolean | null;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
  /** Allowlisted metadata only — never arbitrary patch. */
  metadata?: {
    displayNameEn?: string;
    displayNameAr?: string;
    /** Localized description → Legacy osf / osf_i18n. */
    descriptionEn?: string;
    descriptionAr?: string;
    /** Country ISO-2 (Legacy iso_code) — country resource only. */
    isoCode?: string;
    /** Country currency (Legacy currency_code) — country resource only. */
    currencyCode?: string;
    /** Country currency symbol (Legacy CurrencySymbol / currency_symbol). */
    currencySymbol?: string;
    /** Country VAT % (Legacy vat_percent + vat/isvat sync). */
    vatPercent?: number;
    /** Country app commission % (Legacy app_commission_percent). */
    appCommissionPercent?: number;
    /** Country num_trteb / region sorting. */
    sortOrder?: number;
    countryId?: string;
    regionId?: string;
    cityId?: string;
    /** Landmark category → Legacy tsnef. */
    category?: string;
    /** Landmark map address string (Legacy address). */
    address?: string;
    /** Landmark amenity / promo flags (Legacy ismsgd / isfood / ishmam / as_ads). */
    isMosque?: boolean;
    isFood?: boolean;
    isRestroom?: boolean;
    asAds?: boolean;
    /** Landmark rating 0–5 (Legacy rate). */
    rate?: number;
    visibility?: "public" | "hidden" | "pending";
    lat?: number;
    lng?: number;
  };
  reasonCode: string;
  note?: string;
};

export type GeographyWriteSnapshot = {
  resource: GeographyResource;
  resourceId: string;
  exists: boolean;
  active: boolean;
  archived: boolean;
  countryId: string | null;
  cityId: string | null;
  isCp5OrQa: boolean;
  preconditionToken: string;
};

export type GeographyWriteCanonicalResponse = {
  ok: boolean;
  status: "applied" | "denied" | "failed" | "idempotent_replay";
  code: string;
  message: string;
  action: GeographyWriteAction;
  resource: GeographyResource;
  resourceId: string;
  productionWriteExecuted: boolean;
  auditIntentId?: string;
  auditResultId?: string;
};

/** Historical constant retained for inventory docs/tests. */
export const GEOGRAPHY_WRITE_PRODUCTION_HARD_FALSE = false as const;

export function areGeographyProductionWritesEnabled(
  flags: GeographyWriteFlagGate,
  resource?: GeographyResource,
): boolean {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.GEOGRAPHY_WRITE_ENABLED
  ) {
    return false;
  }
  if (resource === "region" && flags.REGION_WRITE_ENABLED !== true) {
    return false;
  }
  return true;
}

export function assertGeographyProductionWriteEnabled(
  flags: GeographyWriteFlagGate,
  resource?: GeographyResource,
): void {
  if (!areGeographyProductionWritesEnabled(flags, resource)) {
    const code =
      resource === "region" && flags.REGION_WRITE_ENABLED !== true
        ? "PRODUCTION_WRITE_DISABLED"
        : "PRODUCTION_WRITE_DISABLED";
    throw Object.assign(new Error("GEOGRAPHY_WRITE_DISABLED"), {
      code: code as "PRODUCTION_WRITE_DISABLED",
    });
  }
}

export class FakeGeographyWriteRepository {
  readonly kind = "fake_geography_write" as const;
  readonly applied: GeographyWriteCommand[] = [];
  private readonly store = new Map<string, GeographyWriteSnapshot>();

  private key(r: GeographyResource, id: string): string {
    return `${r}:${id}`;
  }

  seed(snapshot: GeographyWriteSnapshot): void {
    this.store.set(this.key(snapshot.resource, snapshot.resourceId), {
      ...snapshot,
    });
  }

  get(
    resource: GeographyResource,
    id: string,
  ): GeographyWriteSnapshot | undefined {
    const s = this.store.get(this.key(resource, id));
    return s ? { ...s } : undefined;
  }

  async apply(command: GeographyWriteCommand): Promise<{
    productionWriteExecuted: false;
    preconditionToken: string;
  }> {
    if (command.action === "create") {
      const next: GeographyWriteSnapshot = {
        resource: command.resource,
        resourceId: command.resourceId,
        exists: true,
        active: true,
        archived: false,
        countryId: command.metadata?.countryId ?? null,
        cityId: command.metadata?.cityId ?? null,
        isCp5OrQa: false,
        preconditionToken: `geo_${Date.now().toString(36)}`,
      };
      this.store.set(this.key(next.resource, next.resourceId), next);
      this.applied.push(command);
      return {
        productionWriteExecuted: false,
        preconditionToken: next.preconditionToken,
      };
    }

    const current = this.store.get(
      this.key(command.resource, command.resourceId),
    );
    if (!current?.exists) {
      throw Object.assign(new Error("GEOGRAPHY_NOT_FOUND"), {
        code: "GEOGRAPHY_NOT_FOUND",
      });
    }
    if (current.isCp5OrQa && command.action !== "archive") {
      throw Object.assign(new Error("CP5_AUTO_CLEANUP_FORBIDDEN"), {
        code: "VALIDATION_FAILED",
      });
    }
    if (current.preconditionToken !== command.preconditionToken) {
      throw Object.assign(new Error("PRECONDITION_FAILED"), {
        code: "PRECONDITION_FAILED",
      });
    }

    const next = { ...current };
    if (command.action === "activate") next.active = true;
    if (command.action === "deactivate") next.active = false;
    if (command.action === "archive") {
      next.archived = true;
      next.active = false;
    }
    next.preconditionToken = `geo_${Date.now().toString(36)}`;
    this.store.set(this.key(next.resource, next.resourceId), next);
    this.applied.push(command);
    return {
      productionWriteExecuted: false,
      preconditionToken: next.preconditionToken,
    };
  }
}

export class DisabledGeographyWriteRepository {
  readonly kind = "disabled_geography_write" as const;
  constructor(private readonly flags: GeographyWriteFlagGate) {}
  async apply(command: GeographyWriteCommand): Promise<never> {
    assertGeographyProductionWriteEnabled(this.flags, command.resource);
    throw new Error("unreachable");
  }
}

export async function executeGeographyControlledWrite(
  command: GeographyWriteCommand,
  deps: {
    flags: GeographyWriteFlagGate;
    repository: {
      apply: (
        c: GeographyWriteCommand,
      ) => Promise<{ productionWriteExecuted: boolean }>;
    };
    allowOfflineExecution?: boolean;
  },
): Promise<GeographyWriteCanonicalResponse> {
  if (!command.actor.permissions.includes("users:manage") &&
      command.actor.role !== "super_admin" &&
      command.actor.role !== "operations_manager" &&
      command.actor.role !== "country_admin") {
    // Geography mutations require elevated ops — use users:manage as proxy until dedicated perm.
    if (!command.actor.permissions.includes("agents:manage")) {
      return {
        ok: false,
        status: "denied",
        code: "PERMISSION_DENIED",
        message: "Insufficient permission for geography write",
        action: command.action,
        resource: command.resource,
        resourceId: command.resourceId,
        productionWriteExecuted: false,
      };
    }
  }

  if (!deps.allowOfflineExecution) {
    try {
      assertGeographyProductionWriteEnabled(deps.flags, command.resource);
    } catch {
      return {
        ok: false,
        status: "denied",
        code: "PRODUCTION_WRITE_DISABLED",
        message: "Geography writes disabled",
        action: command.action,
        resource: command.resource,
        resourceId: command.resourceId,
        productionWriteExecuted: false,
      };
    }
  }

  try {
    const applied = await deps.repository.apply(command);
    return {
      ok: true,
      status: "applied",
      code: "OK",
      message: "Geography mutation applied",
      action: command.action,
      resource: command.resource,
      resourceId: command.resourceId,
      productionWriteExecuted: applied.productionWriteExecuted,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "INTERNAL_WRITE_FAILURE";
    return {
      ok: false,
      status: "denied",
      code,
      message: err instanceof Error ? err.message : String(err),
      action: command.action,
      resource: command.resource,
      resourceId: command.resourceId,
      productionWriteExecuted: false,
    };
  }
}

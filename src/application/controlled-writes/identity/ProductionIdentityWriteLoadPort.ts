/**
 * Production Identity write precondition loader — WIF REST on `user/{id}`.
 * Used when ADMIN_IDENTITY production writes are armed (identity_admin principal).
 * Offline/dev continues to use FakeIdentityWriteRepository in-memory store.
 */

import type { IdentityWriteLoadPort } from "@/application/controlled-writes/identity/IdentityControlledWriteService";
import type {
  IdentityWriteSnapshot,
  IdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import {
  createWifWritePortOrThrow,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { resolveWritePrincipal } from "@/infrastructure/production/writes/ProductionWritePrincipals";
import { IdentityWriteError } from "@/application/controlled-writes/identity/IdentityWriteErrors";

function preconditionTokenFromSnap(
  updateTime: string | null,
  userId: string,
): string {
  if (updateTime) return `fs_ut_${updateTime}`;
  return `fs_exists_${userId.slice(0, 8)}`;
}

function normalizeAdminRule(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function roleFromDoc(
  data: Record<string, unknown>,
): IdentityWritableRole | "none" | "unsupported" {
  if (data.IsAdmin === true || data.isAdmin === true) return "super_admin";
  const rule = normalizeAdminRule(data.isAdminRule ?? data.IsAdminRule);
  if (rule === 1) return "super_admin";
  if (rule === 2) return "country_admin";
  if (rule === 5) return "accountant";
  if (rule === 3 || rule === 4) return "unsupported";
  if (data.is_panel_persona === true) return "none";
  return "none";
}

function countryIdFromDoc(data: Record<string, unknown>): string | null {
  const raw =
    extractLegacyDocRefId(data.Rev_dloh_agent) ||
    extractLegacyDocRefId(data.Rev_dolh) ||
    (typeof data.countryId === "string" ? data.countryId : null) ||
    (typeof data.country_id === "string" ? data.country_id : null);
  if (!raw) return null;
  const resolved = resolveCanonicalCountryId(raw);
  if (resolved.status === "mapped" && resolved.canonicalCountryId) {
    return resolved.canonicalCountryId;
  }
  return raw;
}

function agentIdFromDoc(data: Record<string, unknown>): string | null {
  if (typeof data.agentId === "string" && data.agentId.trim()) {
    return data.agentId.trim();
  }
  if (data.Isagent === true || data.isagent === true) {
    return null; // agent scope present; id may equal document id (caller fills)
  }
  return null;
}

export class ProductionIdentityWriteLoadPort implements IdentityWriteLoadPort {
  readonly kind = "production_identity_write_load" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async load(userId: string): Promise<IdentityWriteSnapshot | null> {
    const id = String(userId || "").trim();
    if (!id) return null;

    const snap = await this.port.getDocument("user", id);
    if (!snap.exists || !snap.data) return null;

    const role = roleFromDoc(snap.data);
    const disabled =
      snap.data.disabled === true ||
      snap.data.actev_user === false ||
      snap.data.active === false;
    const countryId = countryIdFromDoc(snap.data);
    let agentId = agentIdFromDoc(snap.data);
    if (
      agentId == null &&
      (snap.data.Isagent === true || snap.data.isagent === true)
    ) {
      agentId = id;
    }
    const isPanelPersona =
      snap.data.is_panel_persona === true ||
      role === "super_admin" ||
      role === "country_admin" ||
      role === "accountant" ||
      snap.data.Isagent === true ||
      snap.data.isagent === true;

    return {
      userId: id,
      exists: true,
      isPanelPersona,
      role,
      disabled,
      countryId,
      agentId,
      superAdminCountHint: null,
      preconditionToken: preconditionTokenFromSnap(snap.updateTime, id),
      reconciliation: "UNKNOWN",
    };
  }
}

export function createProductionIdentityWriteLoadPort(
  port?: ProductionFirestoreWritePort,
): ProductionIdentityWriteLoadPort {
  if (port) return new ProductionIdentityWriteLoadPort(port);
  const principal = resolveWritePrincipal("identity_admin");
  if (!principal.ready) {
    throw new IdentityWriteError(
      "IDENTITY_ADMIN_WIF_REQUIRED",
      `Production identity load requires dedicated WIF SA (${principal.envVar}): ${principal.reason}`,
    );
  }
  return new ProductionIdentityWriteLoadPort(
    createWifWritePortOrThrow("identity_admin"),
  );
}

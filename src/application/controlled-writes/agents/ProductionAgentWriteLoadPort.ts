/**
 * Production Agent write precondition loader — WIF REST on `user/{id}`.
 * Used only when AGENT production writes are armed (ops_writer principal).
 * Offline/dev continues to use BridgedAgentWriteLoadPort (in-memory).
 */

import type { AgentWriteLoadPort } from "@/application/controlled-writes/agents/AgentWritePreconditions";
import type { AgentWriteSnapshot } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { toProvenAgentState } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { agentCountryBucketId } from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { classifyAgentMembership } from "@/domain/agent/AgentRoleClassification";
import {
  isAgentActiveAt,
  mapAgentAccountState,
} from "@/domain/agent/AgentActiveSemantics";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function preconditionTokenFromSnap(
  updateTime: string | null,
  agentId: string,
): string {
  if (updateTime) return `fs_ut_${updateTime}`;
  return `fs_exists_${agentId.slice(0, 8)}`;
}

function countryIdFromDoc(data: Record<string, unknown>): {
  countryId: string | null;
  countryScopeKind: AgentWriteSnapshot["countryScopeKind"];
} {
  const raw =
    extractLegacyDocRefId(data.Rev_dloh_agent) ||
    extractLegacyDocRefId(data.Rev_dolh) ||
    (typeof data.countryId === "string" ? data.countryId : null) ||
    (typeof data.country_id === "string" ? data.country_id : null);
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

function operationalStateFromDoc(
  data: Record<string, unknown>,
): AgentWriteSnapshot["operationalState"] {
  const explicit = data.operational_status ?? data.status;
  if (typeof explicit === "string" && explicit.trim()) {
    return toProvenAgentState(explicit.trim());
  }
  if (data.active === false || data.actev_user === false) {
    return "inactive";
  }
  if (isAgentActiveAt(data)) {
    return "active";
  }
  return "inactive";
}

export class ProductionAgentWriteLoadPort implements AgentWriteLoadPort {
  readonly kind = "production_agent_write_load" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async loadForWrite(agentId: string): Promise<AgentWriteSnapshot | null> {
    const id = String(agentId || "").trim();
    if (!id) return null;

    const snap = await this.port.getDocument("user", id);
    if (!snap.exists || !snap.data) return null;

    const membership = classifyAgentMembership(snap.data);
    if (!membership.isAgentCandidate) {
      return null;
    }

    const { countryId, countryScopeKind } = countryIdFromDoc(snap.data);
    const account = mapAgentAccountState(snap.data);

    return {
      agentId: id,
      exists: true,
      isOperationalAgent: membership.isOperationalAgent,
      excludedNonAgent: membership.isContaminatingNonAgentIdentity,
      operationalState: operationalStateFromDoc(snap.data),
      accountEnabled:
        account === "enabled"
          ? "enabled"
          : account === "disabled"
            ? "disabled"
            : "unknown",
      countryId,
      countryScopeKind,
      preconditionToken: preconditionTokenFromSnap(snap.updateTime, id),
      updateGeneration: snap.updateTime,
    };
  }

  async findActiveAgentIdForCountry(countryId: string): Promise<string | null> {
    const bucket = agentCountryBucketId(countryId);
    const rows = await this.port.queryEqual("user", "Isagent", true, 80);
    for (const row of rows) {
      if (!row.data) continue;
      if (operationalStateFromDoc(row.data) !== "active") continue;
      const { countryId: rowCountry } = countryIdFromDoc(row.data);
      if (!rowCountry) continue;
      try {
        if (agentCountryBucketId(rowCountry) === bucket) {
          return row.id;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}

export function createProductionAgentWriteLoadPort(
  port: ProductionFirestoreWritePort,
): ProductionAgentWriteLoadPort {
  return new ProductionAgentWriteLoadPort(port);
}

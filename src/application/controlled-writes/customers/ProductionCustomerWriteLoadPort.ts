/**
 * Production Customer write precondition loader — WIF REST on `user/{id}`.
 * Used only when CUSTOMER production writes are armed (ops_writer principal).
 * Offline/dev continues to use BridgedCustomerWriteLoadPort (in-memory).
 */

import type { CustomerWriteLoadPort } from "@/application/controlled-writes/customers/CustomerWritePreconditions";
import type {
  CustomerConflictingRole,
  CustomerCountryScopeKind,
  CustomerMembershipMappingStatus,
  CustomerWriteSnapshot,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { classifyCustomerMembership } from "@/domain/customer/CustomerRoleClassification";
import {
  mapCustomerAccountState,
  mapCustomerTripLockHint,
} from "@/domain/customer/CustomerAccountSemantics";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function preconditionTokenFromSnap(
  updateTime: string | null,
  customerId: string,
): string {
  if (updateTime) return `fs_ut_${updateTime}`;
  return `fs_exists_${customerId.slice(0, 8)}`;
}

function countryIdFromDoc(data: Record<string, unknown>): {
  countryId: string | null;
  countryScopeKind: CustomerCountryScopeKind;
} {
  const raw =
    extractLegacyDocRefId(data.Rev_dolh) ||
    (typeof data.countryId === "string" ? data.countryId : null) ||
    (typeof data.country_id === "string" ? data.country_id : null);
  if (!raw) {
    return { countryId: null, countryScopeKind: "not_represented" };
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

/**
 * Prefer Controlled Write account_status / blocked, then Legacy actev_user.
 */
export function operationalStateFromCustomerDoc(
  data: Record<string, unknown>,
): ProvenCustomerOperationalState {
  const explicit = data.account_status ?? data.accountStatus;
  if (typeof explicit === "string" && explicit.trim()) {
    const v = explicit.trim().toLowerCase();
    if (v === "enabled" || v === "active") return "enabled";
    if (v === "disabled" || v === "inactive" || v === "suspended") {
      return "disabled";
    }
    if (v === "blocked") return "blocked";
    if (v === "deleted") return "deleted";
  }
  if (data.blocked === true) return "blocked";
  const account = mapCustomerAccountState(data);
  if (account === "enabled") return "enabled";
  if (account === "disabled") return "disabled";
  return "unknown";
}

function conflictingRoleFromMembership(
  role: string,
): CustomerConflictingRole {
  switch (role) {
    case "driver":
    case "agent":
    case "super_admin":
    case "finance":
    case "country_admin":
    case "partner":
    case "transport":
    case "tour_guide":
      return role;
    case "customer":
      return "none";
    default:
      return "unknown";
  }
}

function mappingStatusFromMembership(input: {
  isOperationalCustomer: boolean;
  isContaminatingNonCustomerIdentity: boolean;
  isCustomerCandidate: boolean;
  hasPositiveCustomerEvidence: boolean;
}): CustomerMembershipMappingStatus {
  if (input.isOperationalCustomer) return "operational";
  if (input.isContaminatingNonCustomerIdentity) return "excludedNonCustomer";
  if (input.isCustomerCandidate && !input.hasPositiveCustomerEvidence) {
    return "excludedUnknownIdentity";
  }
  return "unknown";
}

export class ProductionCustomerWriteLoadPort implements CustomerWriteLoadPort {
  readonly kind = "production_customer_write_load" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async loadForWrite(customerId: string): Promise<CustomerWriteSnapshot | null> {
    const id = String(customerId || "").trim();
    if (!id) return null;

    const snap = await this.port.getDocument("user", id);
    if (!snap.exists || !snap.data) return null;

    const membership = classifyCustomerMembership(snap.data);
    // Drivers / agents / panel personas are not Customer write targets.
    if (!membership.isCustomerCandidate) {
      return null;
    }

    const { countryId, countryScopeKind } = countryIdFromDoc(snap.data);
    const operationalState = operationalStateFromCustomerDoc(snap.data);
    const account = mapCustomerAccountState(snap.data);
    const tripHint = mapCustomerTripLockHint(snap.data);
    const mappingStatus = mappingStatusFromMembership(membership);
    const conflictingRole = conflictingRoleFromMembership(
      membership.authoritativeRole,
    );

    return {
      customerId: id,
      exists: true,
      isOperationalCustomer: membership.isOperationalCustomer,
      isCustomerCandidate: membership.isCustomerCandidate,
      hasPositiveCustomerEvidence: membership.hasPositiveCustomerEvidence,
      excludedNonCustomer: membership.isContaminatingNonCustomerIdentity,
      excludedUnknownIdentity: mappingStatus === "excludedUnknownIdentity",
      mappingStatus,
      conflictingRole,
      operationalState,
      accountEnabled:
        account === "enabled"
          ? "enabled"
          : account === "disabled"
            ? "disabled"
            : operationalState === "enabled"
              ? "enabled"
              : operationalState === "disabled" ||
                  operationalState === "blocked"
                ? "disabled"
                : "unknown",
      tripState: tripHint === "lockPresent" ? "active" : "idle",
      countryId,
      countryScopeKind,
      preconditionToken: preconditionTokenFromSnap(snap.updateTime, id),
      updateGeneration: snap.updateTime,
    };
  }
}

export function createProductionCustomerWriteLoadPort(
  port: ProductionFirestoreWritePort,
): ProductionCustomerWriteLoadPort {
  return new ProductionCustomerWriteLoadPort(port);
}

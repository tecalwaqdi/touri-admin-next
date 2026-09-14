/**
 * Phase 4A-4 — map Legacy order/{id} → CanonicalTripReadModel.
 *
 * Identity: Firestore document id (order/{id}).
 * Geography: Rev_dolh → countries; vill → villages (product city).
 * Landmarks: listAmakn[].Revmkan / mkan_rev — preserve source paths; no N+1 lookups.
 * Never invent country from coords/phone or city from landmark name.
 */

import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { classifyLegacyCountryRecord } from "@/domain/geography/CountryRecordClassification";
import {
  resolveCityId,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  CanonicalTripReadModel,
  Provenanced,
  UnmappedStatus,
} from "@/domain/canonical/CanonicalReadModels";
import { resolveTripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import { resolveTripPayment } from "@/domain/trip/TripPaymentModels";
import { resolveTripCancellation } from "@/domain/trip/TripCancellationModel";
import { mapTripFinancialSafeRead } from "@/domain/trip/TripFinancialSafeRead";
import type { PersistedMoneyKnowledge } from "@/domain/trip/TripFinancialSafeRead";
import type { CanonicalMoneyField } from "@/domain/canonical/CanonicalReadModels";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import type { TripStatusSource } from "@/domain/trip/TripStatusSourcePriority";
import type { TripCancelActor, TripCancellationKnowledge } from "@/domain/trip/TripCancellationModel";
import {
  classifyLegacyTripRecord,
  type TripMappingStatus,
} from "@/domain/trip/TripRecordClassification";
import { classifyVillPresence } from "@/domain/trip/TripGeographyDiagnostic";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";

export type IdentityKnowledge = "known" | "missing" | "unknown";

export type TripLandmarkRef = {
  landmarkId: string | null;
  sourcePath: string | null;
  knowledge: IdentityKnowledge;
};

function proven<T>(
  value: T | null,
  source: {
    collection: string;
    documentId: string;
    field: string | null;
    sourceValue: unknown;
    confidence?: MappingConfidence;
    warnings?: string[];
  },
): Provenanced<T> {
  return {
    value,
    provenance: {
      sourceSystem: "legacy",
      sourceCollection: source.collection,
      sourceDocumentId: source.documentId,
      sourceField: source.field,
      sourceValue: source.sourceValue as T | null,
      mappingConfidence:
        source.confidence ?? (value == null ? "unknown" : "medium"),
      mappingVersion: LEGACY_MAPPING_VERSION,
      warnings: source.warnings ?? [],
      availabilityStatus: value == null ? "missing" : "available",
    },
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function refPath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.path === "string" && o.path.trim()) return o.path.trim();
  }
  const id = extractLegacyDocRefId(value);
  return id ? `unknown/${id}` : null;
}

function identityFromUserRef(value: unknown): {
  id: string | null;
  knowledge: IdentityKnowledge;
  sourcePath: string | null;
} {
  if (value == null || value === "") {
    return { id: null, knowledge: "missing", sourcePath: null };
  }
  const id = extractLegacyDocRefId(value);
  const path = refPath(value);
  if (!id) {
    return { id: null, knowledge: "unknown", sourcePath: path };
  }
  return { id, knowledge: "known", sourcePath: path };
}

function extractLandmarkFromStop(stop: unknown): TripLandmarkRef {
  if (stop == null || typeof stop !== "object") {
    return { landmarkId: null, sourcePath: null, knowledge: "missing" };
  }
  const o = stop as Record<string, unknown>;
  // Prefer Revmkan (singular), then mkan_rev list first entry
  const singular = o.Revmkan ?? o.revmkan;
  if (singular != null) {
    const id = extractLegacyDocRefId(singular);
    return {
      landmarkId: id,
      sourcePath: refPath(singular),
      knowledge: id ? "known" : "unknown",
    };
  }
  const list = o.mkan_rev ?? o.mkanRev;
  if (Array.isArray(list) && list.length) {
    const id = extractLegacyDocRefId(list[0]);
    return {
      landmarkId: id,
      sourcePath: refPath(list[0]),
      knowledge: id ? "known" : "unknown",
    };
  }
  return { landmarkId: null, sourcePath: null, knowledge: "missing" };
}

function extractPickupDestination(data: Record<string, unknown>): {
  pickup: TripLandmarkRef;
  destination: TripLandmarkRef;
} {
  const list = data.listAmakn;
  if (!Array.isArray(list) || list.length === 0) {
    return {
      pickup: { landmarkId: null, sourcePath: null, knowledge: "missing" },
      destination: { landmarkId: null, sourcePath: null, knowledge: "missing" },
    };
  }
  const pickup = extractLandmarkFromStop(list[0]);
  const destination =
    list.length >= 2
      ? extractLandmarkFromStop(list[list.length - 1])
      : { landmarkId: null, sourcePath: null, knowledge: "missing" as const };
  return { pickup, destination };
}

export type MapCanonicalTripResult = {
  model: CanonicalTripReadModel;
  mappingWarnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
  mappingStatus: TripMappingStatus;
};

/**
 * Core Phase 4A-4 trip mapper from Legacy order document.
 */
export function mapCanonicalTripFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
  aliases?: CityAliasEntry[];
}): MapCanonicalTripResult {
  const warnings: MappingWarning[] = [];
  const incompleteReasons: string[] = [];
  const data = input.data;
  const docId = input.documentId;

  const rawCountryId = extractLegacyDocRefId(data.Rev_dolh ?? data.countryId ?? data.country_id);
  // Product city SoT on order is `vill` → villages/{id} only.
  // Do NOT use cities_user_now (region cities/{id}), vill_text, landmark names, or coords.
  // Unproven order aliases (cityId/city_id/id_vill) are ignored for mapping — see geography diagnostic.
  const rawCityId = extractLegacyDocRefId(data.vill);
  const sourceCountryPath = refPath(data.Rev_dolh ?? data.countryId);
  const sourceCityPath = refPath(data.vill);

  const classified = classifyLegacyTripRecord({
    documentId: docId,
    data,
    countryDocId: rawCountryId,
    cityDocId: rawCityId,
  });

  const lifecycle = resolveTripLifecycleStatus({
    status_code: str(data.status_code),
    order_status: str(data.order_status),
    status: str(data.status),
    ActiveOrder:
      typeof data.ActiveOrder === "boolean" ? data.ActiveOrder : null,
    active: typeof data.active === "boolean" ? data.active : null,
    accepted: typeof data.accepted === "boolean" ? data.accepted : null,
    arrived: typeof data.arrived === "boolean" ? data.arrived : null,
    started: typeof data.started === "boolean" ? data.started : null,
    finished: typeof data.finished === "boolean" ? data.finished : null,
    cancelled: typeof data.cancelled === "boolean" ? data.cancelled : null,
    cancelledBy: str(data.cancelledBy ?? data.cancelled_by),
    DATEEND: data.DATEEND,
    endTime: data.endTime,
    START: data.START,
    halh_order: str(data.halh_order),
    halh_text: str(data.halh_text),
    halh: str(data.halh),
  });
  for (const w of lifecycle.warnings) {
    warnings.push({
      code:
        lifecycle.status === "unmapped" ? "unmapped_status" : "lifecycle_warning",
      field: "status_code",
      message: w,
      severity: lifecycle.status === "unmapped" ? "warning" : "info",
    });
  }

  const payment = resolveTripPayment({
    PaymentMethod: data.PaymentMethod,
    paymentMethod: data.paymentMethod,
    payment_method: data.payment_method,
    payment_status: data.payment_status,
    paymentStatus: data.paymentStatus,
  });
  for (const w of payment.warnings) {
    warnings.push({
      code: w.startsWith("unmapped_payment")
        ? "unmapped_payment"
        : "payment_warning",
      field: "payment",
      message: w,
      severity: "info",
    });
  }

  const cancellation = resolveTripCancellation({
    lifecycleStatus: lifecycle.status,
    cancelledBy: data.cancelledBy,
    cancelled_by: data.cancelled_by,
    cancelled_by_code: data.cancelled_by_code,
    canceled_by: data.canceled_by,
    cancelReason: data.cancelReason,
    cancel_reason: data.cancel_reason,
    cancellation_reason: data.cancellation_reason,
    cancelled_reason: data.cancelled_reason,
    reason: data.reason,
    cancelledAt: data.cancelledAt,
    cancelled_at: data.cancelled_at,
  });
  for (const w of cancellation.warnings) {
    warnings.push({
      code: "cancellation_warning",
      field: "cancellation",
      message: w,
      severity: "warning",
    });
  }

  const financial = mapTripFinancialSafeRead({ documentId: docId, data });
  for (const w of financial.warnings) {
    // Precise warning codes — rates not_represented still emit (never suppress).
    const code =
      w === "vat_rate_not_snapshotted"
        ? "vat_rate_not_snapshotted"
        : w === "platform_commission_rate_not_snapshotted"
          ? "platform_commission_rate_not_snapshotted"
          : w === "currency_not_represented_on_order"
            ? "currency_not_represented_on_order"
            : w.endsWith("_amount_unknown")
              ? "financial_amount_unknown"
              : w === "financial_amount_conflicting"
                ? "financial_amount_conflicting"
                : "financial_safe_read_warning";
    warnings.push({
      code,
      field: "financial",
      message: w,
      severity: "info",
    });
  }

  // Block DO_NOT_EXPOSE financial ops fields from appearing as settled facts
  for (const f of [
    "refundAmount",
    "chargebackAmount",
    "gatewayFee",
    "adjustmentAmount",
  ]) {
    if (f in data) {
      warnings.push({
        code: "financial_field_blocked",
        field: f,
        message: `Blocked financial field ${f}`,
        severity: "info",
      });
    }
  }

  const customer = identityFromUserRef(data.USER ?? data.customerId ?? data.user_id);
  const driver = identityFromUserRef(
    data.mndob_user ?? data.driverId ?? data.mndob_id,
  );
  if (customer.knowledge === "missing") incompleteReasons.push("customerId_missing");
  if (driver.knowledge === "missing") {
    // Driver may be legitimately missing while pending_driver
    if (
      lifecycle.status !== "pending_driver" &&
      lifecycle.status !== "unmapped"
    ) {
      incompleteReasons.push("driverId_missing");
    }
  }

  const agentId =
    str(data.agent_id) ??
    str(data.agentId) ??
    extractLegacyDocRefId(data.agent_user);

  const landmarks = extractPickupDestination(data);

  const createdAtUtc =
    iso(data.data_order) ??
    iso(data.createdAtUtc) ??
    iso(data.created_at) ??
    iso(data.createdAt) ??
    iso(data.timestamp);
  const startedAtUtc = iso(data.START) ?? iso(data.startedAt);
  const completedAtUtc =
    iso(data.DATEEND) ??
    iso(data.endTime) ??
    iso(data.completedAtUtc) ??
    iso(data.completed_at);

  if (!createdAtUtc) incompleteReasons.push("createdAt_missing");

  let mappingStatus: TripMappingStatus = "validMapped";
  let countryId = "";
  let canonicalCountryId = "";
  let cityId = "";
  let mappingConfidence: MappingConfidence = "medium";

  if (classified.classification === "malformed") {
    mappingStatus = "malformed";
    mappingConfidence = "unknown";
    incompleteReasons.push(...classified.reasons);
    warnings.push({
      code: "malformed_trip",
      field: "id",
      message: classified.reasons.join(","),
      severity: "error",
    });
  } else if (classified.classification === "test_or_noncanonical") {
    mappingStatus = "testOrNoncanonical";
    mappingConfidence = "unknown";
    warnings.push({
      code: "test_or_noncanonical_trip",
      field: "id",
      message: classified.reasons.join(","),
      severity: "warning",
    });
  } else if (!rawCountryId) {
    mappingStatus = "unmappedCountry";
    mappingConfidence = "unknown";
    incompleteReasons.push("countryId_missing");
    warnings.push({
      code: "missing_country_relation",
      field: "Rev_dolh",
      message:
        "Trip missing Rev_dolh — not inventing country from coords/phone",
      severity: "error",
    });
  } else if (
    classifyLegacyCountryRecord({ documentId: rawCountryId, data: {} })
      .classification === "test_or_noncanonical" ||
    /^cp5_country_/i.test(rawCountryId)
  ) {
    mappingStatus = "testOrNoncanonical";
    countryId = rawCountryId;
    warnings.push({
      code: "test_or_noncanonical_country_relation",
      field: "Rev_dolh",
      message: `Trip linked to CP5/test country ${rawCountryId}`,
      severity: "warning",
    });
  } else {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    if (resolved.status === "unmapped") {
      mappingStatus = "unmappedCountry";
      countryId = rawCountryId;
      mappingConfidence = "unknown";
      warnings.push({
        code: "unmapped_country",
        field: "Rev_dolh",
        message: `Unmapped country relation: ${rawCountryId}`,
        severity: "error",
      });
    } else {
      countryId = resolved.canonicalCountryId;
      canonicalCountryId = resolved.canonicalCountryId;
      mappingConfidence = resolved.confidence;

      if (!rawCityId) {
        const villCase = classifyVillPresence(data);
        // FINAL POLICY (Phase 4A-4): optional Legacy order.vill may be absent/null.
        // That is cityKnowledge=not_represented — NOT unmappedCity, NOT invent.
        // cityId stays null; sourceCityPath stays null.
        if (
          villCase === "absent_key" ||
          villCase === "null" ||
          villCase === "region_ref_cities_user_now_only" ||
          villCase === "display_text_only"
        ) {
          warnings.push({
            code: "city_not_represented",
            field: "vill",
            message:
              "Authoritative vill city relation absent per optional Legacy schema — not inventing from vill_text/country/coords/landmarks",
            severity: "info",
          });
        } else if (
          villCase === "wrong_type" ||
          villCase === "unextractable_ref_shape" ||
          villCase === "empty_string"
        ) {
          mappingStatus = "malformed";
          mappingConfidence = "unknown";
          incompleteReasons.push("cityId_malformed");
          warnings.push({
            code: "malformed_city_relation",
            field: "vill",
            message: `vill field present with invalid shape (${villCase})`,
            severity: "error",
          });
        } else {
          // different_alias_only or other: source city identity exists but cannot map via vill
          mappingStatus = "unmappedCity";
          incompleteReasons.push("cityId_missing");
          warnings.push({
            code: "missing_city_relation",
            field: "vill",
            message:
              "Trip missing vill city DocumentReference — not inventing from landmark name",
            severity: "error",
          });
        }
      } else {
        const alias = resolveCityId(rawCityId, input.aliases ?? []);
        if (alias.status === "ambiguous") {
          mappingStatus = "ambiguousCity";
          cityId = rawCityId;
          mappingConfidence = "low";
          warnings.push({
            code: "AMBIGUOUS_CITY",
            field: "vill",
            message: `Ambiguous city — candidates: ${alias.candidates.join(",")}`,
            severity: "error",
          });
        } else {
          cityId = alias.status === "mapped" ? alias.cityId : rawCityId;
        }
      }
    }
  }

  if (
    mappingStatus === "validMapped" &&
    lifecycle.status === "unmapped"
  ) {
    mappingStatus = "unmappedStatus";
    incompleteReasons.push("status_unmapped");
  }

  if (!lifecycle.rawStatusCode && lifecycle.status === "unmapped") {
    incompleteReasons.push("status_missing");
  }

  const statusValue: string | UnmappedStatus =
    lifecycle.status === "unmapped" ? "unmapped" : lifecycle.status;

  const activeOrderFlag =
    typeof data.ActiveOrder === "boolean" ? data.ActiveOrder : null;

  const model: CanonicalTripReadModel = {
    id: docId,
    canonicalTripId: docId,
    sourceDocumentId: docId,
    legacyCollection: "order",
    source: "legacy_order",
    status: proven(statusValue, {
      collection: "order",
      documentId: docId,
      field: "status_code",
      sourceValue: lifecycle.rawStatusCode,
      confidence: lifecycle.status === "unmapped" ? "low" : "high",
      warnings: lifecycle.status === "unmapped" ? ["unmapped_status"] : [],
    }),
    lifecycleStatus: lifecycle.status,
    lifecycleStatusSource: lifecycle.source,
    isSafeForOperationalAction: lifecycle.isSafeForOperationalAction,
    isTerminal: lifecycle.isTerminal,
    lifecycleEvidenceFlags: lifecycle.evidenceFlags,
    paymentStatus: proven(
      payment.status === "unmapped" ? "unmapped" : payment.status,
      {
        collection: "order",
        documentId: docId,
        field: "payment_status",
        sourceValue: payment.statusRaw,
        confidence: payment.status === "unmapped" ? "low" : "high",
      },
    ),
    paymentMethod: proven(
      payment.method === "unmapped" ? "unmapped" : payment.method,
      {
        collection: "order",
        documentId: docId,
        field: "PaymentMethod",
        sourceValue: payment.methodRaw,
        confidence: payment.method === "unknown" || payment.method === "unmapped"
          ? "low"
          : "high",
      },
    ),
    customerId: customer.id,
    customerIdKnowledge: customer.knowledge,
    customerSourcePath: customer.sourcePath,
    driverId: driver.id,
    driverIdKnowledge: driver.knowledge,
    driverSourcePath: driver.sourcePath,
    agentId: proven(agentId, {
      collection: "order",
      documentId: docId,
      field: "agent_id",
      sourceValue: agentId,
    }),
    countryId: proven(countryId || null, {
      collection: "order",
      documentId: docId,
      field: "Rev_dolh",
      sourceValue: rawCountryId,
      confidence: mappingStatus === "unmappedCountry" ? "unknown" : mappingConfidence,
    }),
    cityId: proven(cityId || null, {
      collection: "order",
      documentId: docId,
      field: "vill",
      sourceValue: rawCityId,
    }),
    sourceCountryDocumentId: rawCountryId ?? "",
    canonicalCountryId: canonicalCountryId || countryId,
    sourceCountryPath: sourceCountryPath,
    sourceCityDocumentId: rawCityId ?? "",
    sourceCityPath: sourceCityPath,
    pickupLandmarkId: landmarks.pickup.landmarkId,
    pickupLandmarkKnowledge: landmarks.pickup.knowledge,
    sourcePickupLandmarkPath: landmarks.pickup.sourcePath,
    destinationLandmarkId: landmarks.destination.landmarkId,
    destinationLandmarkKnowledge: landmarks.destination.knowledge,
    sourceDestinationLandmarkPath: landmarks.destination.sourcePath,
    currencyCode: proven(financial.currencyCode, {
      collection: "order",
      documentId: docId,
      field: "currency",
      sourceValue: financial.currencyCode,
    }),
    createdAtUtc: proven(createdAtUtc, {
      collection: "order",
      documentId: docId,
      field: "data_order",
      sourceValue: data.data_order ?? data.createdAtUtc ?? null,
    }),
    startedAtUtc: proven(startedAtUtc, {
      collection: "order",
      documentId: docId,
      field: "START",
      sourceValue: data.START ?? null,
    }),
    completedAtUtc: proven(completedAtUtc, {
      collection: "order",
      documentId: docId,
      field: "DATEEND",
      sourceValue: data.DATEEND ?? data.endTime ?? null,
    }),
    activeOrderFlag,
    iDorder: str(data.IDorder),
    financialSafeRead: {
      totalApp: financial.totalApp,
      totalAppKnowledge: financial.totalAppKnowledge,
      totalVat: financial.totalVat,
      totalVatKnowledge: financial.totalVatKnowledge,
      totalMndob: financial.totalMndob,
      totalMndobKnowledge: financial.totalMndobKnowledge,
      totalMndob2: financial.totalMndob2,
      totalMndob2Knowledge: financial.totalMndob2Knowledge,
      vatRatePercent: financial.vatRatePercent,
      vatRateKnowledge: financial.vatRateKnowledge,
      platformCommissionRatePercent: financial.platformCommissionRatePercent,
      platformCommissionRateKnowledge: financial.platformCommissionRateKnowledge,
      isAccountingApproved: false,
      isSettlementSafe: false,
    },
    cancellation: {
      isCancelled: cancellation.isCancelled,
      actor: cancellation.actor,
      actorKnowledge: cancellation.actorKnowledge,
      reason: cancellation.reason,
      reasonKnowledge: cancellation.reasonKnowledge,
      cancelledAtUtc: cancellation.cancelledAtUtc,
      evidenceFields: cancellation.evidenceFields,
    },
    mappingStatus,
    incompleteReasons,
    mappingConfidence:
      incompleteReasons.length || mappingStatus !== "validMapped"
        ? mappingConfidence === "high"
          ? "low"
          : mappingConfidence
        : mappingConfidence,
    mappingVersion: LEGACY_MAPPING_VERSION,
  };

  return {
    model,
    mappingWarnings: warnings,
    mappingConfidence: model.mappingConfidence,
    mappingStatus,
  };
}

// Re-export types used by CanonicalTripReadModel consumers
export type {
  TripLifecycleStatus,
  TripStatusSource,
  TripCancelActor,
  TripCancellationKnowledge,
  PersistedMoneyKnowledge,
  CanonicalMoneyField,
};

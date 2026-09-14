/**
 * Phase 4A-4 — Financial safe-read for trips (NOT accounting approval).
 * Frozen persisted historical candidates: total_app / total_vat / total_mndob / total_mndob2.
 * Never recompute with current rates. Never assume 15%. Rates null unless snapshotted.
 * Missing ≠ 0. Uses CanonicalMoneyField + Money (no float settlement math).
 *
 * MoneyKnowledge = CanonicalMoneyField with explicit FinancialAvailabilityStatus.
 */

import {
  assertIncompleteNotZero,
  nullWithProvenance,
  provenValue,
  type FinancialAvailabilityStatus,
  type FinancialConceptClass,
} from "@/domain/canonical/FieldProvenance";
import type { CanonicalMoneyField } from "@/domain/canonical/CanonicalReadModels";
import { Money } from "@/domain/finance/Money";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";

/** Alias — existing money knowledge primitive (no duplicate Money class). */
export type MoneyKnowledge = CanonicalMoneyField;

export type PersistedMoneyKnowledge =
  | "persisted"
  | "known_zero"
  | "missing"
  | "unknown"
  | "not_represented"
  | "conflicting"
  | "derived";

export type TripFinancialSafeRead = {
  currencyCode: string | null;
  /** Platform fee — order.total_app (SAR major historical). */
  totalApp: MoneyKnowledge;
  totalAppKnowledge: PersistedMoneyKnowledge;
  /** VAT amount — order.total_vat. */
  totalVat: MoneyKnowledge;
  totalVatKnowledge: PersistedMoneyKnowledge;
  /** Driver net — order.total_mndob. */
  totalMndob: MoneyKnowledge;
  totalMndobKnowledge: PersistedMoneyKnowledge;
  /** Gross base fare — order.total_mndob2 (when present). */
  totalMndob2: MoneyKnowledge;
  totalMndob2Knowledge: PersistedMoneyKnowledge;
  /** Never invent 15% — only snapshotted rate fields if present. */
  vatRatePercent: number | null;
  vatRateKnowledge: PersistedMoneyKnowledge;
  platformCommissionRatePercent: number | null;
  platformCommissionRateKnowledge: PersistedMoneyKnowledge;
  /** Integer-safe Money in minor units when persisted major is known (display helper only). */
  totalAppMinor: Money | null;
  totalVatMinor: Money | null;
  totalMndobMinor: Money | null;
  warnings: string[];
  /** Explicit: not accounting / not settlement-approved. */
  isAccountingApproved: false;
  isSettlementSafe: false;
};

function classifyPersistedMajor(
  value: unknown,
  fieldPresent: boolean,
): { knowledge: PersistedMoneyKnowledge; major: number | null } {
  if (!fieldPresent) {
    return { knowledge: "missing", major: null };
  }
  if (value == null || value === "") {
    return { knowledge: "missing", major: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { knowledge: "unknown", major: null };
  }
  if (value === 0) {
    return { knowledge: "known_zero", major: 0 };
  }
  return { knowledge: "persisted", major: value };
}

function toMoneyField(
  major: number | null,
  knowledge: PersistedMoneyKnowledge,
  field: string,
  docId: string,
  currency: string | null,
  warnings: string[],
): MoneyKnowledge {
  const availability: FinancialAvailabilityStatus =
    knowledge === "persisted" || knowledge === "known_zero"
      ? "available"
      : knowledge === "derived"
        ? "derived"
        : knowledge === "not_represented"
          ? "not_represented"
          : knowledge === "conflicting"
            ? "conflicting"
            : knowledge === "unknown"
              ? "unknown"
              : "missing";

  const classification: FinancialConceptClass =
    knowledge === "persisted" || knowledge === "known_zero"
      ? "A_authoritative_persisted"
      : knowledge === "derived"
        ? "B_reliable_derived"
        : knowledge === "conflicting"
          ? "C_conflicting"
          : knowledge === "missing"
            ? "D_missing"
            : "E_unknown";

  if (major == null || availability === "missing" || availability === "unknown") {
    const n = nullWithProvenance(`${knowledge}:${field}`, {
      sourceSystem: "legacy",
      sourceCollection: "order",
      sourceDocumentId: docId,
      sourceField: field,
      mappingConfidence: "unknown",
      mappingVersion: LEGACY_MAPPING_VERSION,
      availabilityStatus: availability,
      warnings,
    });
    assertIncompleteNotZero(field, n.value, availability);
    return {
      ...n,
      unit: "unknown",
      currencyCode: currency,
      classification,
      availabilityStatus: availability,
    };
  }

  const p = provenValue(major, {
    sourceSystem: "legacy",
    sourceCollection: "order",
    sourceDocumentId: docId,
    sourceField: field,
    sourceValue: major,
    mappingConfidence: "high",
    mappingVersion: LEGACY_MAPPING_VERSION,
    availabilityStatus: "available",
    warnings,
  });
  return {
    ...p,
    unit: "major",
    currencyCode: currency,
    classification,
    availabilityStatus: "available",
  };
}

function majorToMinorMoney(
  major: number | null,
  currency: string | null,
): Money | null {
  if (major == null || !currency || !Number.isFinite(major)) return null;
  // Display helper only — round to minor; never use for settlement arithmetic chains.
  return Money.of(Math.round(major * 100), currency);
}

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function rateField(
  data: Record<string, unknown>,
  keys: string[],
): { value: number | null; knowledge: PersistedMoneyKnowledge } {
  for (const k of keys) {
    if (!hasOwn(data, k)) continue;
    const v = data[k];
    if (v == null || v === "") {
      return { value: null, knowledge: "missing" };
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return {
        value: v,
        knowledge: v === 0 ? "known_zero" : "persisted",
      };
    }
    return { value: null, knowledge: "unknown" };
  }
  return { value: null, knowledge: "not_represented" };
}

/**
 * Map frozen historical financial candidates from an order document.
 * Does NOT recompute platform % or VAT %.
 */
export function mapTripFinancialSafeRead(input: {
  documentId: string;
  data: Record<string, unknown>;
}): TripFinancialSafeRead {
  const warnings: string[] = [];
  const currencyRaw =
    (typeof input.data.currencyCode === "string" && input.data.currencyCode) ||
    (typeof input.data.currency === "string" && input.data.currency) ||
    (typeof input.data.currency_code === "string" && input.data.currency_code) ||
    null;
  // Legacy orders are SAR-major historically for SA; do NOT invent currency when absent.
  const currencyCode = currencyRaw ? String(currencyRaw).trim().toUpperCase() : null;
  if (!currencyCode) {
    warnings.push("currency_not_represented_on_order");
  }

  const app = classifyPersistedMajor(
    input.data.total_app,
    hasOwn(input.data, "total_app"),
  );
  const vat = classifyPersistedMajor(
    input.data.total_vat,
    hasOwn(input.data, "total_vat"),
  );
  const mndob = classifyPersistedMajor(
    input.data.total_mndob,
    hasOwn(input.data, "total_mndob"),
  );
  const mndob2 = classifyPersistedMajor(
    input.data.total_mndob2,
    hasOwn(input.data, "total_mndob2"),
  );

  const vatRate = rateField(input.data, [
    "vat_rate_percent",
    "vat_percent_snapshot",
    "vatRateAtTrip",
  ]);
  const platformRate = rateField(input.data, [
    "app_commission_percent_snapshot",
    "platform_commission_rate_percent",
    "app_commission_percent",
  ]);
  if (vatRate.knowledge === "not_represented") {
    warnings.push("vat_rate_not_snapshotted");
  }
  if (platformRate.knowledge === "not_represented") {
    warnings.push("platform_commission_rate_not_snapshotted");
  }
  if (app.knowledge === "unknown") warnings.push("total_app_amount_unknown");
  if (vat.knowledge === "unknown") warnings.push("total_vat_amount_unknown");
  if (mndob.knowledge === "unknown") warnings.push("total_mndob_amount_unknown");
  if (mndob2.knowledge === "unknown") {
    warnings.push("total_mndob2_amount_unknown");
  }
  if (app.knowledge === "conflicting" || vat.knowledge === "conflicting") {
    warnings.push("financial_amount_conflicting");
  }

  return {
    currencyCode,
    totalApp: toMoneyField(
      app.major,
      app.knowledge,
      "total_app",
      input.documentId,
      currencyCode,
      [],
    ),
    totalAppKnowledge: app.knowledge,
    totalVat: toMoneyField(
      vat.major,
      vat.knowledge,
      "total_vat",
      input.documentId,
      currencyCode,
      [],
    ),
    totalVatKnowledge: vat.knowledge,
    totalMndob: toMoneyField(
      mndob.major,
      mndob.knowledge,
      "total_mndob",
      input.documentId,
      currencyCode,
      [],
    ),
    totalMndobKnowledge: mndob.knowledge,
    totalMndob2: toMoneyField(
      mndob2.major,
      mndob2.knowledge,
      "total_mndob2",
      input.documentId,
      currencyCode,
      [],
    ),
    totalMndob2Knowledge: mndob2.knowledge,
    vatRatePercent: vatRate.value,
    vatRateKnowledge: vatRate.knowledge,
    platformCommissionRatePercent: platformRate.value,
    platformCommissionRateKnowledge: platformRate.knowledge,
    totalAppMinor: toMoneyFieldMinor(app.major, currencyCode),
    totalVatMinor: majorToMinorMoney(vat.major, currencyCode),
    totalMndobMinor: majorToMinorMoney(mndob.major, currencyCode),
    warnings,
    isAccountingApproved: false,
    isSettlementSafe: false,
  };
}

function toMoneyFieldMinor(
  major: number | null,
  currency: string | null,
): Money | null {
  return majorToMinorMoney(major, currency);
}

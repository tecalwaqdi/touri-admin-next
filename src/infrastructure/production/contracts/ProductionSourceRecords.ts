/**
 * Phase 4 DESIGN — raw Production source record shapes (interfaces only).
 * These represent Legacy Firestore documents after a future authenticated read.
 * NO SDK, NO network, NO credential loading.
 */

import type { SOURCE_SCHEMA_VERSION_UNKNOWN } from "@/domain/production-read/constants";

export type SourceSchemaVersion =
  | typeof SOURCE_SCHEMA_VERSION_UNKNOWN
  | string;

export type ProductionSourceMeta = {
  sourceCollection: string;
  sourceDocumentId: string;
  sourceSchemaVersion: SourceSchemaVersion;
  sourceVersion: string | null;
  fetchedAtUtc: string;
};

/** Opaque Legacy trip/order document — field names intentionally loose. */
export type ProductionTripSourceRecord = ProductionSourceMeta & {
  resource: "trip";
  raw: Record<string, unknown>;
};

export type ProductionDriverSourceRecord = ProductionSourceMeta & {
  resource: "driver";
  raw: Record<string, unknown>;
};

export type ProductionAgentSourceRecord = ProductionSourceMeta & {
  resource: "agent";
  raw: Record<string, unknown>;
};

/** Customer summary only in initial Phase 4A — not full profile dump. */
export type ProductionCustomerSummarySourceRecord = ProductionSourceMeta & {
  resource: "customer_summary";
  raw: Record<string, unknown>;
};

export type ProductionCountrySourceRecord = ProductionSourceMeta & {
  resource: "country";
  raw: Record<string, unknown>;
};

export type ProductionCitySourceRecord = ProductionSourceMeta & {
  resource: "city";
  raw: Record<string, unknown>;
};

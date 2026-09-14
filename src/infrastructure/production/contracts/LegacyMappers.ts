/**
 * Phase 4 DESIGN — Legacy → Canonical mapper contracts.
 * Implementations in Phase 4A may use fakes then real mappers — NOT here as Production wire.
 */

import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  ProductionAgentSourceRecord,
  ProductionCustomerSummarySourceRecord,
  ProductionDriverSourceRecord,
  ProductionTripSourceRecord,
} from "@/infrastructure/production/contracts/ProductionSourceRecords";

export type MappingWarning = {
  code: string;
  field?: string;
  message: string;
  severity: "info" | "warning" | "error";
};

export type MappedReadResult<T> = {
  model: T;
  mappingWarnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
  sourceVersion: string | null;
  mappingVersion: string;
  sourceSchemaVersion: string;
};

export interface LegacyTripMapper {
  map(source: ProductionTripSourceRecord): MappedReadResult<CanonicalTripReadModel>;
}

export interface LegacyDriverMapper {
  map(
    source: ProductionDriverSourceRecord,
  ): MappedReadResult<CanonicalDriverReadModel>;
}

export interface LegacyAgentMapper {
  map(
    source: ProductionAgentSourceRecord,
  ): MappedReadResult<CanonicalAgentReadModel>;
}

/** Customer summary mapper — PII still redacted downstream by default. */
export interface LegacyCustomerSummaryMapper {
  map(
    source: ProductionCustomerSummarySourceRecord,
  ): MappedReadResult<CanonicalCustomerReadModel>;
}

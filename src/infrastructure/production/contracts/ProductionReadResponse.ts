/**
 * Phase 4 DESIGN — envelope for Production shadow read responses.
 */

import type { DataSourceIdentity } from "@/domain/production-read/constants";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type { ReadSafetyLevel } from "@/domain/read/ReadQuery";

export type ProductionReadEnvelope<T> = {
  data: T;
  meta: DataSourceIdentity & {
    mappingWarnings: MappingWarning[];
    mappingConfidence: MappingConfidence;
    mappingVersion: string;
    sourceVersion: string | null;
    sourceSchemaVersion: string;
    readSafety: ReadSafetyLevel;
    blockedFields: string[];
    piiRedacted: boolean;
    requestId: string;
    correlationId: string;
  };
};

export type ProductionUnavailableEnvelope = {
  data: null;
  meta: {
    sourceEnvironment: "production";
    sourceSystem: "legacy";
    readMode: "shadow" | "disabled";
    degraded: true;
    message: string;
    code: "PRODUCTION_DATA_UNAVAILABLE" | "PRODUCTION_READ_DISABLED" | "CIRCUIT_OPEN";
    requestId: string;
    correlationId: string;
  };
};

/**
 * Mixing synthetic and production on the same screen is FORBIDDEN.
 * Callers must choose one identity for the response surface.
 */
export function assertHomogeneousDataSource(
  a: DataSourceIdentity,
  b: DataSourceIdentity,
): void {
  if (
    a.sourceEnvironment !== b.sourceEnvironment ||
    a.sourceSystem !== b.sourceSystem ||
    a.readMode !== b.readMode
  ) {
    throw new Error(
      "DATA_SOURCE_MIX_FORBIDDEN: synthetic and production must not share a screen",
    );
  }
}

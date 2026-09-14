/**
 * Phase 3 mapping result types — documentation/compile-time only.
 * No live Firestore adapters.
 */

export type MappingConfidence = "high" | "medium" | "low" | "unknown";

export type MappingProvenance =
  | "proven_write"
  | "proven_read"
  | "derived"
  | "legacy_only"
  | "ambiguous"
  | "not_found";

export type LegacyFieldEntry = {
  id: string;
  collection: string;
  field: string;
  meaning: string;
  canonicalConcept?: string;
  type?: string;
  confidence: MappingConfidence;
  provenance: MappingProvenance;
  evidence: string[];
  productionReadBlocker?: boolean;
  notes?: string;
};

export type StatusMappingEntry = {
  legacyValue: string;
  canonicalValue: string;
  confidence: MappingConfidence;
  evidence: string[];
  aliases?: string[];
};

export type FormulaMappingEntry = {
  id: string;
  name: string;
  formula: string;
  location: string;
  confidence: MappingConfidence;
  conflictsWith?: string[];
};

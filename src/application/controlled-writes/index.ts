/**
 * Phase 5 — Controlled Writes readiness public surface.
 * Architecture + offline contracts only. No Production mutation.
 * Phase 5A Driver Controlled Writes: ./drivers
 * Phase 5B Agent Controlled Writes: ./agents
 * Phase 5C Customer Controlled Writes: ./customers
 * Phase 5D Consolidation facade: ControlledWritesService
 */

export * from "@/application/controlled-writes/ControlledWriteTypes";
export * from "@/application/controlled-writes/ControlledWriteCandidates";
export * from "@/application/controlled-writes/ControlledWriteFlags";
export * from "@/application/controlled-writes/ControlledWritePermissions";
export * from "@/application/controlled-writes/ControlledWriteScope";
export * from "@/application/controlled-writes/ControlledWritePreconditions";
export * from "@/application/controlled-writes/ControlledWriteIdempotency";
export * from "@/application/controlled-writes/ControlledWriteAudit";
export * from "@/application/controlled-writes/ControlledWritePipeline";
export * from "@/application/controlled-writes/ControlledWriteReadiness";
export * from "@/application/controlled-writes/ControlledWriteEnablement";
export * from "@/application/controlled-writes/ControlledWriteResourceAllowlist";
export * from "@/application/controlled-writes/ControlledWriteErrorCatalog";
export * from "@/application/controlled-writes/ControlledWriteConsolidatedIdempotency";
export * from "@/application/controlled-writes/ControlledWriteConsolidatedAudit";
export * from "@/application/controlled-writes/ControlledWriteAtomicity";
export * from "@/application/controlled-writes/ControlledWriteConsolidationGates";
export * from "@/application/controlled-writes/ControlledWritePilotReadiness";
export * from "@/application/controlled-writes/ControlledWritesService";
export * as driverControlledWrites from "@/application/controlled-writes/drivers";
export * as agentControlledWrites from "@/application/controlled-writes/agents";
export * as customerControlledWrites from "@/application/controlled-writes/customers";

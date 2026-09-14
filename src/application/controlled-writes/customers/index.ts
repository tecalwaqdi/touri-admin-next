/**
 * Phase 5C — Customer Controlled Writes public surface.
 * Offline/Fake/Emulator validation only. Production writes remain disabled.
 * No Finance. No account deletion. No Auth dual-write.
 */

export * from "@/application/controlled-writes/customers/CustomerWriteErrors";
export * from "@/application/controlled-writes/customers/CustomerWriteTypes";
export * from "@/application/controlled-writes/customers/CustomerStateMachine";
export * from "@/application/controlled-writes/customers/CustomerWriteFlags";
export * from "@/application/controlled-writes/customers/CustomerWriteRbac";
export * from "@/application/controlled-writes/customers/CustomerWriteScope";
export * from "@/application/controlled-writes/customers/CustomerWriteMembership";
export * from "@/application/controlled-writes/customers/CustomerWriteValidation";
export * from "@/application/controlled-writes/customers/CustomerWritePreconditions";
export * from "@/application/controlled-writes/customers/CustomerWriteIdempotency";
export * from "@/application/controlled-writes/customers/CustomerWriteAudit";
export * from "@/application/controlled-writes/customers/CustomerWriteRepository";
export * from "@/application/controlled-writes/customers/CustomerWriteCommands";
export * from "@/application/controlled-writes/customers/CustomerControlledWriteService";

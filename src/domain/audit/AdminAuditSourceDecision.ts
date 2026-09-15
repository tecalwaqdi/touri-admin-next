/**
 * PC-4 — Production Admin Audit source decision (inspect-first).
 *
 * Candidates inspected:
 * 1. Synthetic InMemory AuditRepository — Development only; forbidden in Production.
 * 2. finance_audit_events — Finance FR pilot audit; NOT in FINANCE_REPORTING_RO;
 *    finance-ops contract only. MUST NOT merge into Admin Audit UI.
 * 3. admin_next_cw_audit — Admin Next controlled-write INTENT/RESULT docs
 *    (Phase 5M/5N). Exists in Production; written by Admin Next CW pilots.
 *    Schema known; exact getById safe; datastore.viewer already covers RO.
 *
 * CANONICAL for Admin Next operational audit UI: `admin_next_cw_audit`
 * (controlled-write audit subset — not a full platform action log).
 * Finance audit remains separate (do not merge).
 */

import { PHASE_5M_AUDIT_COLLECTION } from "@/application/controlled-writes/pilot/Phase5MIamDerivation";

export const PRODUCTION_ADMIN_AUDIT_SOURCE = {
  kind: "admin_next_controlled_write_audit" as const,
  collection: PHASE_5M_AUDIT_COLLECTION,
  transport: "wif_native" as const,
  financeAuditMerged: false,
  financeAuditCollection: "finance_audit_events" as const,
  defaultPageSize: 20 as const,
  maxPageSize: 50 as const,
};

/**
 * Offline / synthetic settlement SM used by SettlementService unit paths.
 * Production finance writes MUST use Settlement V2 (see compatibility module).
 * Dual-SM Production blocker is cleared by routing write paths through V2 only.
 */

import type { SettlementStatus } from "@/domain/settlement/Settlement";

export class IllegalSettlementTransitionError extends Error {
  readonly code = "ILLEGAL_SETTLEMENT_TRANSITION";

  constructor(from: SettlementStatus, to: SettlementStatus) {
    super(`Illegal settlement transition: ${from} → ${to}`);
    this.name = "IllegalSettlementTransitionError";
  }
}

const ALLOWED: Record<SettlementStatus, SettlementStatus[]> = {
  draft: ["under_review"],
  under_review: ["approved", "rejected", "draft"],
  rejected: ["draft"],
  approved: ["closed"],
  closed: ["reversed"],
  reversed: [],
};

export class SettlementStateMachine {
  canTransition(from: SettlementStatus, to: SettlementStatus): boolean {
    return ALLOWED[from].includes(to);
  }

  assertTransition(from: SettlementStatus, to: SettlementStatus): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalSettlementTransitionError(from, to);
    }
  }

  allowedFrom(status: SettlementStatus): SettlementStatus[] {
    return [...ALLOWED[status]];
  }
}

export const settlementStateMachine = new SettlementStateMachine();

/** Explicit role — not Production SoT. */
export const SYNTHETIC_SETTLEMENT_SM_ROLE = "offline_synthetic_only" as const;

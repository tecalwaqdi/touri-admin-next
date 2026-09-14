/**
 * Settlement V2 state machine — Production vocabulary.
 */

import {
  canTransitionSettlementV2,
  type SettlementV2Status,
} from "@/domain/finance/v2/FinanceImplementationContracts";

export { canTransitionSettlementV2 };

export const SETTLEMENT_V2_TRANSITIONS: Record<
  SettlementV2Status,
  readonly SettlementV2Status[]
> = {
  draft: ["locked", "voided"],
  locked: ["partially_paid", "settled", "voided"],
  partially_paid: ["settled", "voided"],
  settled: [],
  voided: [],
};

export function assertSettlementTransition(
  from: SettlementV2Status,
  to: SettlementV2Status,
): void {
  if (!canTransitionSettlementV2(from, to)) {
    throw new Error(`invalid_settlement_transition:${from}->${to}`);
  }
}

/** Map V2 → synthetic display-only labels (never write path). */
export function mapV2StatusToSyntheticDisplay(
  status: SettlementV2Status,
): "draft" | "under_review" | "approved" | "closed" | "reversed" {
  switch (status) {
    case "draft":
      return "draft";
    case "locked":
    case "partially_paid":
      return "approved";
    case "settled":
      return "closed";
    case "voided":
      return "reversed";
  }
}

import type { FinancialTrip } from "@/domain/finance/FinancialTrip";

export type EligibilityReasonCode =
  | "NOT_COMPLETED"
  | "INCOMPLETE_FINANCIAL"
  | "DISPUTED"
  | "ALREADY_SETTLED"
  | "CURRENCY_MISMATCH"
  | "REFUND_PENDING"
  | "MISSING_PARTY"
  | "WRONG_PARTY"
  | "OUTSIDE_PERIOD";

export type EligibilityExclusion = {
  tripId: string;
  reasonCode: EligibilityReasonCode;
  reasonLabel: string;
  details: string;
};

export type EligibilityResult = {
  eligible: FinancialTrip[];
  excluded: EligibilityExclusion[];
};

const LABELS: Record<EligibilityReasonCode, string> = {
  NOT_COMPLETED: "Trip not completed",
  INCOMPLETE_FINANCIAL: "Incomplete financial data",
  DISPUTED: "Trip under dispute",
  ALREADY_SETTLED: "Already included in a closed settlement",
  CURRENCY_MISMATCH: "Currency mismatch",
  REFUND_PENDING: "Refund pending",
  MISSING_PARTY: "Missing driver or agent party",
  WRONG_PARTY: "Trip does not belong to selected party",
  OUTSIDE_PERIOD: "Trip outside settlement period",
};

export class SettlementEligibilityService {
  evaluate(input: {
    financialTrips: FinancialTrip[];
    partyType: "driver" | "agent";
    partyId: string;
    currencyCode: string;
    periodFromUtc: string;
    periodToUtc: string;
    tripCompletedAtById: Record<string, string | null>;
  }): EligibilityResult {
    const eligible: FinancialTrip[] = [];
    const excluded: EligibilityExclusion[] = [];
    const currency = input.currencyCode.toUpperCase();

    for (const ft of input.financialTrips) {
      const completedAt = input.tripCompletedAtById[ft.tripId] ?? null;

      if (ft.confidence === "disputed" || ft.incompleteReasons.includes("UNDER_DISPUTE") || ft.status === "under_dispute") {
        excluded.push(this.excl(ft.tripId, "DISPUTED", "Trip marked under dispute"));
        continue;
      }
      if (ft.status === "refunded" || ft.incompleteReasons.includes("REFUND_PENDING")) {
        excluded.push(this.excl(ft.tripId, "REFUND_PENDING", ft.incompleteReasons.join(",") || "refunded"));
        continue;
      }
      if (ft.status !== "completed") {
        excluded.push(this.excl(ft.tripId, "NOT_COMPLETED", `status=${ft.status}`));
        continue;
      }
      if (ft.confidence === "incomplete" || ft.incompleteReasons.length > 0 && !ft.settlementEligible) {
        if (ft.incompleteReasons.includes("REFUND_PENDING")) {
          excluded.push(this.excl(ft.tripId, "REFUND_PENDING", ft.incompleteReasons.join(",")));
          continue;
        }
        if (
          ft.incompleteReasons.includes("MISSING_DRIVER") ||
          ft.incompleteReasons.includes("MISSING_AGENT")
        ) {
          excluded.push(this.excl(ft.tripId, "MISSING_PARTY", ft.incompleteReasons.join(",")));
          continue;
        }
        excluded.push(
          this.excl(ft.tripId, "INCOMPLETE_FINANCIAL", ft.incompleteReasons.join(",") || ft.confidence),
        );
        continue;
      }
      if (ft.alreadySettledInId) {
        excluded.push(
          this.excl(ft.tripId, "ALREADY_SETTLED", `settlementId=${ft.alreadySettledInId}`),
        );
        continue;
      }
      if (ft.currencyCode.toUpperCase() !== currency) {
        excluded.push(
          this.excl(
            ft.tripId,
            "CURRENCY_MISMATCH",
            `trip=${ft.currencyCode} settlement=${currency}`,
          ),
        );
        continue;
      }
      const partyMatch =
        input.partyType === "driver"
          ? ft.parties.driverId === input.partyId
          : ft.parties.agentId === input.partyId;
      if (!partyMatch) {
        excluded.push(
          this.excl(
            ft.tripId,
            "WRONG_PARTY",
            `${input.partyType}=${input.partyId}`,
          ),
        );
        continue;
      }
      if (!completedAt || completedAt < input.periodFromUtc || completedAt > input.periodToUtc) {
        excluded.push(
          this.excl(
            ft.tripId,
            "OUTSIDE_PERIOD",
            `completedAt=${completedAt ?? "null"}`,
          ),
        );
        continue;
      }

      eligible.push(ft);
    }

    return { eligible, excluded };
  }

  private excl(
    tripId: string,
    reasonCode: EligibilityReasonCode,
    details: string,
  ): EligibilityExclusion {
    return {
      tripId,
      reasonCode,
      reasonLabel: LABELS[reasonCode],
      details,
    };
  }
}

export const settlementEligibilityService = new SettlementEligibilityService();

/**
 * Calculation pipeline order (D-07).
 * Historical: load persisted majors — skip rate recalculation.
 * New/synthetic: may project from approved policy (never invent for history).
 */

import {
  CALCULATION_PIPELINE_ORDER,
  type CalculationPipelineStage,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import type { TripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";

export type PipelineMode = "historical_persisted" | "new_from_approved_policy";

export type PipelineStageResult = {
  stage: CalculationPipelineStage;
  skipped: boolean;
  reason?: string;
  amountMinor: bigint | null;
};

export type PipelineRunResult = {
  mode: PipelineMode;
  stages: PipelineStageResult[];
  productionApproved: false;
  policyBlockers: string[];
};

/**
 * Run conceptual pipeline over a historical snapshot.
 * Does NOT invent commission/VAT rates. Uses persisted amounts only.
 */
export function runHistoricalCalculationPipeline(
  snapshot: TripFinancialSnapshot,
): PipelineRunResult {
  const policyBlockers: string[] = [];
  const stages: PipelineStageResult[] = [];

  for (const stage of CALCULATION_PIPELINE_ORDER) {
    switch (stage) {
      case "gross_fare":
        stages.push({
          stage,
          skipped: false,
          amountMinor: snapshot.majors.grossFare.amountMinor,
          reason: "persisted_total_mndob2",
        });
        break;
      case "discounts":
        stages.push({
          stage,
          skipped: false,
          amountMinor:
            snapshot.majors.customerTotal.amountMinor != null &&
            snapshot.majors.grossFare.amountMinor != null
              ? snapshot.majors.grossFare.amountMinor -
                snapshot.majors.customerTotal.amountMinor
              : null,
          reason: "observed_from_majors_if_present",
        });
        break;
      case "eligibility":
        stages.push({
          stage,
          skipped: false,
          amountMinor: null,
          reason: snapshot.majors.lifecycleCompleted
            ? "completed"
            : "not_completed",
        });
        break;
      case "platform_commission":
        stages.push({
          stage,
          skipped: false,
          amountMinor: snapshot.majors.platformCommission.amountMinor,
          reason: "persisted_total_app_not_re_rated",
        });
        // FC-01 APPROVED for NEW calcs; historical path never re-rates from policy %.
        break;
      case "vat":
        stages.push({
          stage,
          skipped: false,
          amountMinor: snapshot.majors.vatAmount.amountMinor,
          reason: "persisted_total_vat_not_re_rated",
        });
        break;
      case "driver_net":
        stages.push({
          stage,
          skipped: false,
          amountMinor: snapshot.majors.driverNet.amountMinor,
          reason: "persisted_total_mndob_wins",
        });
        if (snapshot.majors.driverNet.availability !== "available") {
          policyBlockers.push(
            "driver_net_not_persisted_settlement_ineligible",
          );
        }
        break;
      case "agent_share":
        stages.push({
          stage,
          skipped: snapshot.agent.status !== "snapshot",
          amountMinor: snapshot.agent.amountMinor,
          reason:
            snapshot.agent.status === "snapshot"
              ? "order_agent_snapshot"
              : "unknown_historical_never_current_agent",
        });
        break;
      case "company_net":
        stages.push({
          stage,
          skipped: false,
          amountMinor: snapshot.companyPlatformNet.amountMinor,
          reason: "platform_minus_agent_when_known",
        });
        break;
      case "settlement_positions":
      case "settlement_aggregates":
        stages.push({
          stage,
          skipped: true,
          amountMinor: null,
          reason: "computed_at_settlement_cycle",
        });
        break;
      default:
        stages.push({ stage, skipped: true, amountMinor: null });
    }
  }

  return {
    mode: "historical_persisted",
    stages,
    productionApproved: false,
    policyBlockers: [...new Set(policyBlockers)],
  };
}

export function assertPipelineOrderLocked(): readonly CalculationPipelineStage[] {
  return CALCULATION_PIPELINE_ORDER;
}

/**
 * Half-up percent of amount in minor units (new/synthetic path only).
 * Never use for historical re-rating.
 */
export function percentOfMinorHalfUp(
  amountMinor: bigint,
  percent: number,
): bigint {
  if (!Number.isFinite(percent)) {
    throw new Error("percent_not_finite");
  }
  // percent e.g. 15 → 15% = amount * 15 / 100, half-up.
  const scaled = amountMinor * BigInt(Math.round(percent * 100));
  const denom = BigInt(10000);
  const half = denom / BigInt(2);
  const q = scaled / denom;
  const r = scaled % denom;
  const adj =
    r >= half || r <= -half
      ? scaled < BigInt(0)
        ? BigInt(-1)
        : BigInt(1)
      : BigInt(0);
  return q + adj;
}

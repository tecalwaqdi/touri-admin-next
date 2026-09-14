/**
 * Finance shadow orchestrator — offline fixtures or live ADC snapshot.
 * Always productionWrites=0. FINANCE_WRITE_ENABLED must stay false.
 */

import { ProductionFinanceReadAdapter } from "@/adapters/finance/ProductionFinanceReadAdapter";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PHASE_FINANCE_SHADOW_EXPECTED_PROJECT_ID } from "@/domain/finance/shadow/isPhaseFinanceShadowEnabled";
import type { FinanceShadowAggregate } from "@/domain/finance/shadow/FinanceShadowTypes";
import { aggregateFinanceShadowFindings } from "@/application/finance/shadow/FinanceShadowAggregator";
import {
  detectDuplicateIdempotency,
  validateAgentCountryUniquenessShadow,
  validateOrderFinanceShadow,
  validateSettlementFinanceShadow,
} from "@/application/finance/shadow/FinanceShadowValidator";
import { loadFinanceShadowProductionSnapshot } from "@/application/finance/shadow/FinanceShadowProductionPorts";
import type {
  ProductionOrderReadInput,
  ProductionSettlementReadInput,
} from "@/adapters/finance/ProductionFinanceReadAdapter";

export const FINANCE_SHADOW_BUGS_FIXED = [
  "lifecycleCompleted now uses order.status_code (TourySystemStatusCodes)",
  "driverId resolved from mndob_user / driverRef when driver_id absent",
  "countryId resolved from countryRef / Rev_dolh when country_id absent",
  "settlement amount maps absoluteSettlementAmountMinor; periods periodStart/End",
  "settlement currency no longer defaults to invented SAR",
  "settlement claims fall back to eligibleOrderIds linkage",
] as const;

export function runFinanceShadowOnDocuments(input: {
  projectId?: string;
  mode: FinanceShadowAggregate["mode"];
  orders: ProductionOrderReadInput[];
  settlements: ProductionSettlementReadInput[];
  countriesWithMultipleActiveAgents?: number;
  productionReads?: number;
}): FinanceShadowAggregate {
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED must remain false");
  }
  const adapter = new ProductionFinanceReadAdapter();
  const findings = [];
  for (const order of input.orders) {
    findings.push(
      ...validateOrderFinanceShadow(
        {
          order,
          settlements: input.settlements,
          currentCountryAgentId: "agent_should_never_apply",
        },
        adapter,
      ),
    );
  }
  for (const settlement of input.settlements) {
    findings.push(...validateSettlementFinanceShadow(settlement, adapter));
  }
  findings.push(...detectDuplicateIdempotency(input.settlements));
  findings.push(
    ...validateAgentCountryUniquenessShadow({
      countriesWithMultipleActiveAgents:
        input.countriesWithMultipleActiveAgents ?? 0,
    }),
  );

  return aggregateFinanceShadowFindings({
    projectId: input.projectId ?? PHASE_FINANCE_SHADOW_EXPECTED_PROJECT_ID,
    mode: input.mode,
    ordersScanned: input.orders.length,
    settlementsScanned: input.settlements.length,
    productionReads: input.productionReads ?? 0,
    countriesWithMultipleActiveAgents:
      input.countriesWithMultipleActiveAgents ?? 0,
    findings,
    implementationBugsFixed: [...FINANCE_SHADOW_BUGS_FIXED],
  });
}

export async function runFinanceShadowLiveAdc(input?: {
  harnessArmed: boolean;
}): Promise<{
  summary: FinanceShadowAggregate;
  productionWriteInvoked: false;
}> {
  if (!input?.harnessArmed) {
    return {
      summary: {
        ...runFinanceShadowOnDocuments({
          mode: "offline_fixture",
          orders: [],
          settlements: [],
        }),
        overallStatus: "SKIPPED",
        blockers: ["PHASE_FINANCE_SHADOW not armed"],
      },
      productionWriteInvoked: false,
    };
  }

  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";

  const snap = await loadFinanceShadowProductionSnapshot();
  const summary = runFinanceShadowOnDocuments({
    mode: "live_adc_readonly",
    orders: snap.orders,
    settlements: snap.settlements,
    countriesWithMultipleActiveAgents: snap.countriesWithMultipleActiveAgents,
    productionReads: snap.productionReads,
  });

  return { summary, productionWriteInvoked: false };
}

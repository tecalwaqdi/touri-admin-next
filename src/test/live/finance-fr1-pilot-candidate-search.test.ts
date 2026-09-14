// @vitest-environment node
/**
 * FR1 pilot candidate READ-ONLY ADC search.
 * DEFAULT SKIP unless FINANCE_FR1_PILOT_SEARCH=1.
 * Never writes. Never arms FINANCE_WRITE_ENABLED.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { searchFinanceFr1PilotCandidateReadOnly } from "@/application/finance/pilot/FinanceFr1PilotReadOnlySearch";
import { prepareFinanceFr1Pilot } from "@/application/finance/pilot/FinanceFr1PilotPreparation";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

const SEARCH = process.env.FINANCE_FR1_PILOT_SEARCH === "1";

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.FINANCE_FR1_PILOT_APPLY = "";
}

describe("Finance FR1 pilot candidate read-only search (SKIP default)", () => {
  afterAll(() => {
    disableWriteFlags();
  });

  it(
    "defaults SKIP; when armed searches ADC read-only for synthetic trip",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
      disableWriteFlags();

      if (!SEARCH) {
        expect(SEARCH).toBe(false);
        return;
      }

      const search = await searchFinanceFr1PilotCandidateReadOnly({
        orderLimit: 50,
      });
      expect(search.productionWrites).toBe(0);

      const prep = prepareFinanceFr1Pilot({
        orders: search.selected ? [search.selected] : [],
        actorPermissions: ["finance:read", "settlements:prepare"],
        discountFundingOwner: "company",
        priorSnapshotExists:
          search.priorSnapshotExists || search.priorIdempotencyExists,
        asOfUtc: "2026-09-13T21:00:00.000Z",
      });

      const reportDir = join(process.cwd(), ".local", "finance-fr1-pilot");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(
        join(reportDir, "candidate-search-safe-summary.json"),
        JSON.stringify(
          {
            reachable: search.reachable,
            reason: search.reason,
            completedOrdersScanned: search.completedOrdersScanned,
            syntheticCandidates: search.syntheticCandidates,
            realOrUnknownSkipped: search.realOrUnknownSkipped,
            selectedId: search.selected?.documentId ?? null,
            selectedClassification: search.selectedClassification,
            priorSnapshotExists: search.priorSnapshotExists,
            priorIdempotencyExists: search.priorIdempotencyExists,
            productionReads: search.productionReads,
            productionWrites: search.productionWrites,
            prep: {
              fc01Status: prep.fc01Status,
              pilotCandidateFound: prep.pilotCandidateFound,
              pilotTripClassification: prep.pilotTripClassification,
              goNoGo: prep.goNoGo,
              goNoGoReasons: prep.goNoGoReasons,
              calculatedSnapshot: prep.calculatedSnapshot,
              exactExpectedWrites: prep.exactExpectedWrites,
              requiredIamPermissions: prep.requiredIamPermissions,
              expectedAdcPrincipal: prep.expectedAdcPrincipal,
              oneShotLiveCommand: prep.oneShotLiveCommand,
              cleanupCommand: prep.cleanupCommand,
              productionWritesThisSession: prep.productionWritesThisSession,
            },
          },
          null,
          2,
        ) + "\n",
      );

      expect(prep.productionWritesThisSession).toBe(0);
      expect(prep.financeWriteEnabled).toBe(false);
    },
    90_000,
  );
});

import { describe, expect, it } from "vitest";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { runFinanceCutoverInventoryDryRun } from "@/application/finance/cutover/FinanceCutoverInventoryDryRun";
import {
  resolveFinanceCutoverDate,
} from "@/domain/finance/cutover/FinanceCutoverConfig";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

describe("finance cutover dry-run", () => {
  it("resolves proposed default cutover without approval", () => {
    const cfg = resolveFinanceCutoverDate({ env: {} });
    expect(cfg.businessDate).toBe("2026-10-01");
    expect(cfg.cutoverTimezone).toBe("Asia/Riyadh");
    expect(cfg.cutoverUtcInstant).toBe("2026-09-30T21:00:00.000Z");
    expect(cfg.source).toBe("proposed_default");
    expect(cfg.approved).toBe(false);
  });

  it("uses env FINANCE_CUTOVER_DATE as Asia/Riyadh business date", () => {
    const cfg = resolveFinanceCutoverDate({
      env: {
        FINANCE_CUTOVER_DATE: "2026-10-01",
        FINANCE_CUTOVER_APPROVED: "1",
      },
    });
    expect(cfg.cutoverUtcInstant).toBe("2026-09-30T21:00:00.000Z");
    expect(cfg.source).toBe("env");
    expect(cfg.approved).toBe(true);
  });

  it("inventories golden FR7 chain as provenance-proven QA without deletes", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const report = runFinanceCutoverInventoryDryRun({
      bundle,
      cutoverDate: "2099-01-01T00:00:00.000Z",
      approved: false,
      boundedWindow: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.productionWrites).toBe(0);
    expect(report.deletions).toBe(0);
    expect(report.safety.realRecordsProposedForDelete).toBe(0);
    expect(report.safety.readyToApplyCutover).toBe(false);

    expect(report.counts.QA_TEST + report.counts.DEMO_PILOT).toBeGreaterThan(0);
    expect(report.qa.provenanceProvenSafeToDelete.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        FINANCE_FR1_SYNTHETIC_ORDER_ID,
        FINANCE_FR2_SETTLEMENT_DOC_ID,
      ]),
    );
    expect(report.idsByClass.QA_TEST).toContain(FINANCE_FR2_SETTLEMENT_DOC_ID);
  });

  it("does not invent opening balances from incomplete/orphan rows", () => {
    const base = buildFinanceFr7GoldenSourceBundle();
    const orphanBundle = {
      ...base,
      settlements: [
        ...base.settlements,
        {
          id: "fin_set_orphan_legacy_001",
          partyType: "driver" as const,
          partyId: "drv_real_001",
          countryId: "saudi_arabia",
          currency: "SAR",
          status: "legacy_open",
          direction: "DRIVER_PAYS_COMPANY",
          amountMinor: BigInt(5000),
          paidConfirmedMinor: BigInt(0),
          periodFromUtc: "2025-01-01T00:00:00.000Z",
          periodToUtc: "2025-01-31T00:00:00.000Z",
          sourceAccountingSnapshotId: null,
          sourceOrderId: "order_real_001",
          claims: [],
          updatedAtUtc: "2025-02-01T00:00:00.000Z",
        },
      ],
    };

    const report = runFinanceCutoverInventoryDryRun({
      bundle: orphanBundle,
      cutoverDate: "2099-01-01T00:00:00.000Z",
      boundedWindow: true,
    });

    expect(report.counts.LEGACY_ORPHAN).toBe(1);
    expect(report.idsByClass.LEGACY_ORPHAN).toContain(
      "fin_set_orphan_legacy_001",
    );
    expect(
      report.openingBalances.proposals.some(
        (p) => p.partyId === "drv_real_001",
      ),
    ).toBe(false);
    expect(
      report.openingBalances.unresolved.some((u) =>
        u.recordIds.includes("fin_set_orphan_legacy_001"),
      ),
    ).toBe(true);
  });
});

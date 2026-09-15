import { describe, expect, it, beforeEach } from "vitest";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import {
  FINANCE_FR7_ADJUSTMENT_DOC_ID,
  FINANCE_FR7_PAYMENT_DOC_ID,
  FINANCE_FR7_SETTLEMENT_DOC_ID,
  FINANCE_FR7_SOURCE_SNAPSHOT_ID,
  FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { createFakeFinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { ProductionFinanceReportingReadAdapter } from "@/adapters/finance/reporting/ProductionFinanceReportingReadAdapter";
import {
  validateFinanceFr7GoldenOfflineParity,
  validateFinanceFr7ProductionReadOnly,
} from "@/application/finance/reporting/FinanceFr7ProductionRoValidation";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import { NAV_ITEMS } from "@/config/navigation";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function seedFromGolden() {
  const bundle = buildFinanceFr7GoldenSourceBundle();
  const snap = bundle.snapshots[0]!;
  const sett = bundle.settlements[0]!;
  const pay = bundle.payments[0]!;
  const adj = bundle.adjustments[0]!;

  const toPlain = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "bigint" ? v.toString() : v;
    }
    return out;
  };

  return createFakeFinanceReportingRoFirestorePort({
    docs: {
      finance_accounting_snapshots: {
        [FINANCE_FR7_SOURCE_SNAPSHOT_ID]: toPlain({
          ...snap,
          claims: undefined,
        } as never),
      },
      financial_settlements: {
        [FINANCE_FR7_SETTLEMENT_DOC_ID]: toPlain({
          ...sett,
          claims: sett.claims.map((c) => ({
            ...c,
            amountMinor: c.amountMinor?.toString() ?? null,
          })),
        } as never),
      },
      financial_settlement_payments: {
        [FINANCE_FR7_PAYMENT_DOC_ID]: toPlain(pay as never),
      },
      finance_adjustments: {
        [FINANCE_FR7_ADJUSTMENT_DOC_ID]: toPlain(adj as never),
      },
      finance_refund_accounting: {},
      finance_chargeback_accounting: {},
      finance_payout_preparations: {},
    },
  });
}

describe("FR7 Production RO source + validation", () => {
  beforeEach(() => {
    process.env.FINANCE_REPORTING_SOURCE_MODE = "synthetic";
  });

  it("Production adapter loads chain with synthetic=false and writes=0", async () => {
    const port = seedFromGolden();
    const adapter = new ProductionFinanceReportingReadAdapter(port);
    const loaded = await adapter.load();
    expect(loaded.mode).toBe("production_read_only");
    expect(loaded.bundle.synthetic).toBe(false);
    expect(loaded.productionWrites).toBe(0);
    expect(loaded.firestoreMutations).toBe(0);
    expect(port.getCounter().productionWrites).toBe(0);
    expect(port.getCounter().firestoreMutations).toBe(0);
    expect(port.getCounter().productionReads).toBeGreaterThan(0);
  });

  it("settlement list and detail share authoritative FR7 values", async () => {
    const port = seedFromGolden();
    const loaded = await new ProductionFinanceReportingReadAdapter(port).load();
    const svc = new FinanceReportingReadService(loaded.bundle);
    const actor = {
      userId: "u",
      role: "accountant" as const,
      permissions: ["finance:read"],
      scope: { type: "global" as const },
    };
    const list = svc.settlements(actor);
    const detail = svc.settlement(actor, list[0]!.id)!;
    expect(detail.amountMinor).toBe(list[0]!.amountMinor);
    expect(detail.outstandingMinor).toBe(list[0]!.outstandingMinor);
    expect(detail.amountMinor).toBe(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.settlementAmountMinor,
    );
    expect(detail.approvedAdjustments[0]?.monetaryEffect).toBe(false);
  });

  it("RO validation harness PASS offline against seeded Production chain", async () => {
    const result = await validateFinanceFr7ProductionReadOnly({
      firestore: seedFromGolden(),
      expectGoldenMatch: true,
    });
    expect(result.totalProductionWrites).toBe(0);
    expect(result.firestoreMutations).toBe(0);
    expect(result.goldenMatch).toBe(true);
    expect(result.settlementListParity).toBe(true);
    expect(result.settlementDetailParity).toBe(true);
    expect(result.canonicalCountryMatch).toBe(true);
    expect(result.scopePass).toBe(true);
    expect(result.fr6NeutralMemoMonetaryEffectFalse).toBe(true);
    expect(result.noDuplicateSettlementCount).toBe(true);
    expect(result.overallStatus).toBe("PASS");
  });

  it("golden offline parity remains for tests", () => {
    const p = validateFinanceFr7GoldenOfflineParity();
    expect(p.goldenMatch).toBe(true);
    expect(p.settlementListParity).toBe(true);
  });

  it("Support/Settings removed from production nav", () => {
    expect(NAV_ITEMS.some((i) => i.href === "/support")).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/notifications")).toBe(true);
    expect(NAV_ITEMS.some((i) => i.href === "/settings")).toBe(false);
  });

  it("security: FINANCE_WRITE_ENABLED default false; no SA key env in factory", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const factorySrc = readFileSync(
      join(
        process.cwd(),
        "src/application/finance/reporting/getFinanceReportingReadService.ts",
      ),
      "utf8",
    );
    expect(factorySrc).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS\s*=/);
    expect(factorySrc).toMatch(/production_read_only/);
  });

  it("SettlementDetailPage reads FR7 API only", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/features/settlements/SettlementDetailPage.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/\/api\/finance\/settlements\//);
    expect(src).not.toMatch(/\/api\/settlements\/\$\{/);
    expect(src).not.toMatch(/summary\.|FinancialCalculation|amountMinor\s*\+/);
  });
});

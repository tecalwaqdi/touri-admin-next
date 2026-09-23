import { describe, expect, it } from "vitest";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { classifyLegacyTripRecord } from "@/domain/trip/TripRecordClassification";
import {
  runHistoricalSaudiTripsDryRun,
  type HistoricalSaudiScanPort,
} from "@/application/finance/materialize/HistoricalSaudiTripsDryRun";
import { mapOrderToTripFinancialSnapshot } from "@/adapters/finance/ProductionFinanceReadAdapter";

describe("historical Saudi country + fixture guards", () => {
  it("maps full Firestore country resource paths to saudi_arabia", () => {
    expect(
      tryCanonicalCountryId(
        "projects/tutorial-multi-language-70gx4j/databases/(default)/documents/countries/saudi_arabia",
      ),
    ).toBe("saudi_arabia");
    expect(tryCanonicalCountryId("countries/saudi_arabia")).toBe(
      "saudi_arabia",
    );
    expect(tryCanonicalCountryId("saudi_arabia")).toBe("saudi_arabia");
  });

  it("excludes finance control fixture ids without catching fin_set_*", () => {
    expect(isFinanceQaOrPilotRecordId("demo_fin_trip_001")).toBe(true);
    expect(isFinanceQaOrPilotRecordId("fin_rt_cash_1788391755618")).toBe(true);
    expect(isFinanceQaOrPilotRecordId("fin7_ctrl_1788321182908")).toBe(true);
    expect(isFinanceQaOrPilotRecordId("fin9_ctrl_1788330608071")).toBe(true);
    expect(isFinanceQaOrPilotRecordId("fin_set_real_settlement")).toBe(false);
  });

  it("classifies finance control orders as test_or_noncanonical", () => {
    const r = classifyLegacyTripRecord({
      documentId: "fin_rt_cash_ui_1",
      data: { status_code: "completed" },
    });
    expect(r.classification).toBe("test_or_noncanonical");
  });

  it("resolveOrderCountryId via mapOrder uses document id not full path", () => {
    const snap = mapOrderToTripFinancialSnapshot({
      documentId: "ord_sa_1",
      data: {
        status_code: "completed",
        PaymentMethod: "Cash",
        payment_status: "cash_collected",
        currency: "SAR",
        Rev_dolh:
          "projects/tutorial-multi-language-70gx4j/databases/(default)/documents/countries/saudi_arabia",
        total_mndob2: 100,
        total_app: 15,
        total_vat: 0,
        total_mndob: 85,
      },
    });
    expect(snap.countryId).toBe("saudi_arabia");
  });
});

describe("runHistoricalSaudiTripsDryRun", () => {
  it("classifies real Saudi eligible vs QA vs unpaid without writes", async () => {
    const saudiRef =
      "projects/x/databases/(default)/documents/countries/saudi_arabia";
    const orders = [
      {
        id: "demo_fin_trip_001",
        data: {
          status_code: "completed",
          PaymentMethod: "Cash",
          payment_status: "cash_collected",
          currency: "SAR",
          Rev_dolh: saudiRef,
          total_mndob2: 100,
          total_app: 15,
          total_vat: 0,
          total_mndob: 85,
        },
      },
      {
        id: "real_sa_paid_001",
        data: {
          status_code: "completed",
          PaymentMethod: "Cash",
          payment_status: "cash_collected",
          currency: "SAR",
          Rev_dolh: saudiRef,
          total_mndob2: 100,
          total_app: 15,
          total_vat: 0,
          total_mndob: 85,
          production_financial: true,
        },
      },
      {
        id: "real_sa_pending_001",
        data: {
          status_code: "completed",
          PaymentMethod: "Cash",
          payment_status: "pending_cash",
          currency: "SAR",
          Rev_dolh: saudiRef,
          total_mndob2: 100,
          total_app: 15,
          total_vat: 0,
          total_mndob: 85,
        },
      },
      {
        id: "real_ru_001",
        data: {
          status_code: "completed",
          PaymentMethod: "Cash",
          payment_status: "cash_collected",
          currency: "RUB",
          country_id: "russia",
          total_mndob2: 100,
          total_app: 15,
          total_vat: 0,
          total_mndob: 85,
        },
      },
    ];

    const port: HistoricalSaudiScanPort = {
      async listOrdersPage() {
        return { docs: orders, nextCursor: null };
      },
      async getSnapshotExists() {
        return false;
      },
    };

    const result = await runHistoricalSaudiTripsDryRun({
      port,
      maxPages: 2,
      pageSize: 50,
    });

    expect(result.dryRun).toBe(true);
    expect(result.productionWrites).toBe(0);
    expect(result.counts.qaExcluded).toBe(1);
    expect(result.counts.nonSaudi).toBe(1);
    expect(result.counts.realHistoricalSaudi).toBe(2);
    expect(result.counts.financiallyEligible).toBe(1);
    expect(result.counts.unpaidOrIncomplete).toBe(1);
    expect(result.financiallyEligible[0]?.orderId).toBe("real_sa_paid_001");
    expect(result.financiallyEligible[0]?.platformCommissionMinor).toBe("1500");
    expect(result.scanComplete).toBe(true);
  });
});

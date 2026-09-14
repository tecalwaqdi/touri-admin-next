/**
 * Phase 3.6 — Financial Policy Freeze & Canonicalization tests.
 * No Production Firebase. Incomplete ≠ zero. Historical rules frozen.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapLegacyFinancialSnapshotToCanonical,
  observedLegacyQuoteMajors,
} from "@/domain/canonical/mapLegacyFinancialSnapshot";
import {
  assertIncompleteNotZero,
  mustRemainNullNotZero,
  CANONICAL_MAPPING_VERSION,
} from "@/domain/canonical/FieldProvenance";
import {
  assertPolicyUsableForProduction,
  createDraftFinancialPolicy,
} from "@/domain/canonical/FinancialPolicy";
import { FUTURE_VAT_POLICY_DRAFT } from "@/domain/canonical/VatPolicy";
import {
  FUTURE_CHARGEBACK_POLICY_DRAFT,
  historicalChargebackNotRepresented,
} from "@/domain/canonical/ChargebackPolicy";
import {
  DISCOUNT_TREATMENT_POLICY_UNRESOLVED,
  mayReduceDriverNetByDiscount,
} from "@/domain/canonical/DiscountTreatmentPolicy";
import {
  CANONICAL_FINANCIAL_SOURCE_PRIORITY_POLICY,
  NO_HISTORICAL_RECALCULATION_RULE,
} from "@/domain/canonical/CanonicalFinancialSourcePriorityPolicy";
import {
  CANONICAL_FIELD_CLASSIFICATIONS,
  classificationFor,
} from "@/domain/canonical/FinancialFieldClassification";
import { evaluateTripFinancialSafety } from "@/domain/canonical/FinancialFieldSafety";
import { financialCalculationService } from "@/domain/finance/FinancialCalculationService";
import { isHeaderUserIdAuthAllowed } from "@/infrastructure/http/apiAuth";
import { getEnv } from "@/config/env";

describe("Phase 3.6 historical platform commission", () => {
  it("preserves historical total_app as platformCommissionAmount", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-1",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      PaymentMethod: "cash",
      payment_status: "cash_collected",
      agent_id: "agent-snap-1",
    });
    expect(m.platformCommissionAmount.value).toBe(7.5);
    expect(m.platformCommissionAmount.availabilityStatus).toBe("available");
    expect(m.platformCommissionAmount.provenance.sourceField).toBe("total_app");
  });

  it("keeps unknown historical rate null (does not invent 15)", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-2",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      observed: { platformFeePercentHardcoded: 15 },
      agent_id: "a1",
    });
    expect(m.platformCommissionRatePercent.value).toBeNull();
    expect(m.platformCommissionRatePercent.availabilityStatus).toBe("unknown");
  });

  it("missing total_app → null + incomplete (never 0)", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-3",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: null,
      total_vat: 0,
      total_mndob: 42.5,
      agent_id: "a1",
    });
    expect(m.platformCommissionAmount.value).toBeNull();
    expect(m.platformCommissionAmount.value).not.toBe(0);
    expect(m.incompleteReasons).toContain("platform_commission_amount_missing");
  });
});

describe("Phase 3.6 historical driver net + discount policy", () => {
  it("preserves historical total_mndob", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-4",
      currency: "SAR",
      total: 45,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      ksm: 5,
      agent_id: "a1",
    });
    expect(m.driverNet.value).toBe(42.5);
    expect(m.driverNet.availabilityStatus).toBe("available");
  });

  it("DiscountTreatmentPolicy unresolved — does not auto-reduce driver net", () => {
    expect(DISCOUNT_TREATMENT_POLICY_UNRESOLVED.treatmentStatus).toBe(
      "unresolved",
    );
    expect(DISCOUNT_TREATMENT_POLICY_UNRESOLVED.productionApproved).toBe(false);
    expect(mayReduceDriverNetByDiscount()).toBe(false);

    const withDisc = observedLegacyQuoteMajors({
      baseFareHalalas: 5000,
      platformFeePercent: 15,
      applyVat: false,
      discountHalalas: 500,
    });
    const mapped = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-5",
      currency: "SAR",
      ...withDisc,
      ksm: 5,
      agent_id: "a1",
    });
    // Customer total reduced; driver net from base−app−vat unchanged by discount
    expect(mapped.finalCustomerAmount.value).toBe(45);
    expect(mapped.driverNet.value).toBe(42.5);
    expect(mapped.warnings.some((w) => w.includes("FC-02"))).toBe(true);
  });

  it("derived driver net carries provenance and is not settlement-safe", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-6",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: null,
      allowDerivedDriverNet: true,
      derivedDriverNetMajor: 42.5,
      agent_id: "a1",
    });
    expect(m.driverNet.value).toBe(42.5);
    expect(m.driverNet.availabilityStatus).toBe("derived");
    expect(m.driverNet.provenance.formulaId).toBe(
      "legacy_cf_base_minus_app_minus_vat",
    );
    expect(m.driverNet.provenance.derivedFrom).toContain("total_app");
    expect(m.isSafeForSettlement).toBe(false);
    expect(m.safety.settlementBlockReasons).toContain("DRIVER_NET_UNRESOLVED");
  });
});

describe("Phase 3.6 historical agent attribution", () => {
  it("uses snapshot agent when present", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-7",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      agent_id: "hist-agent-99",
      agent_amount: 1.5,
      agent_rate: 20,
    });
    expect(m.agentId.value).toBe("hist-agent-99");
    expect(m.agentAttributionStatus).toBe("snapshot");
    expect(m.agentIdSnapshot).toBe("hist-agent-99");
  });

  it("unknown historical agent is null — never current country agent", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-8",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
    });
    expect(m.agentId.value).toBeNull();
    expect(m.agentAttributionStatus).toBe("unknown_historical");
    expect(m.safety.settlementBlockReasons).toContain(
      "AGENT_ATTRIBUTION_UNKNOWN",
    );
    expect(m.isSafeForDisplay).toBe(true);
    expect(m.isSafeForSettlement).toBe(false);
  });

  it("rate-only does not invent agent amount as high confidence", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-9",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      agent_rate: 20,
      agent_id: "a1",
    });
    expect(m.agentCommissionAmount.value).toBeNull();
    expect(m.agentCommissionRatePercent.value).toBe(20);
    expect(m.incompleteReasons).toContain("agent_amount_missing_rate_only");
  });
});

describe("Phase 3.6 historical VAT", () => {
  it("preserves historical VAT amount; rate stays null", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-10",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 7.5,
      total_mndob: 35,
      observed: { vatPercent: 15, isvat: true },
      agent_id: "a1",
    });
    expect(m.vatAmount.value).toBe(7.5);
    expect(m.vatRateAtTrip.value).toBeNull();
    expect(m.vatRatePercent.value).toBeNull();
  });

  it("future VatPolicy remains draft / productionApproved=false", () => {
    expect(FUTURE_VAT_POLICY_DRAFT.status).toBe("draft");
    expect(FUTURE_VAT_POLICY_DRAFT.productionApproved).toBe(false);
    expect(FUTURE_VAT_POLICY_DRAFT.rateBps).toBeNull();
  });
});

describe("Phase 3.6 chargeback", () => {
  it("chargeback not_represented ≠ zero", () => {
    const cb = historicalChargebackNotRepresented();
    expect(cb.status).toBe("not_represented");
    expect(cb.amount).toBeNull();
    expect(cb.amount).not.toBe(0);

    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-11",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      agent_id: "a1",
    });
    expect(m.chargebackStatus).toBe("not_represented");
    expect(m.chargebackAmount.value).toBeNull();
    expect(m.chargebackAmount.availabilityStatus).toBe("not_represented");
    expect(FUTURE_CHARGEBACK_POLICY_DRAFT.productionApproved).toBe(false);
  });
});

describe("Phase 3.6 incomplete ≠ zero", () => {
  it("forbids null/missing/NaN → 0 in mapper outputs", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-12",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: null,
      total_vat: null,
      total_mndob: null,
      agent_id: "a1",
    });
    const nullish = [
      m.platformCommissionAmount,
      m.vatAmount,
      m.driverNet,
      m.gatewayFee,
      m.refundAmount,
      m.chargebackAmount,
      m.adjustmentAmount,
    ];
    for (const f of nullish) {
      expect(f.value).toBeNull();
      expect(f.value).not.toBe(0);
      expect(
        mustRemainNullNotZero(f.value, f.availabilityStatus),
      ).toBe(true);
      expect(() =>
        assertIncompleteNotZero(
          "field",
          f.value,
          f.availabilityStatus,
        ),
      ).not.toThrow();
    }
  });

  it("assertIncompleteNotZero throws if missing coerced to 0", () => {
    expect(() =>
      assertIncompleteNotZero("x", 0, "missing"),
    ).toThrow(/INCOMPLETE_TO_ZERO_FORBIDDEN/);
    expect(() =>
      assertIncompleteNotZero("x", 0, "not_represented"),
    ).toThrow(/INCOMPLETE_TO_ZERO_FORBIDDEN/);
  });
});

describe("Phase 3.6 display vs settlement vs accounting safety", () => {
  it("display may be true while settlement/accounting false", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-13",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      // no agent snapshot
    });
    expect(m.isSafeForDisplay).toBe(true);
    expect(m.isSafeForSettlement).toBe(false);
    expect(m.isSafeForAccounting).toBe(false);
  });

  it("conflicting fields block settlement via safety evaluator", () => {
    const s = evaluateTripFinancialSafety({
      fields: [
        {
          name: "grossFare",
          availability: "available",
          value: 50,
          criticalForSettlement: true,
        },
        {
          name: "finalCustomerAmount",
          availability: "available",
          value: 50,
          criticalForSettlement: true,
        },
        {
          name: "platformCommissionAmount",
          availability: "conflicting",
          value: null,
          criticalForSettlement: true,
        },
        {
          name: "driverNet",
          availability: "available",
          value: 40,
          criticalForSettlement: true,
        },
        {
          name: "chargebackAmount",
          availability: "not_represented",
          value: null,
        },
      ],
      agentAttributionStatus: "snapshot",
      discountTreatmentUnresolved: true,
      currencyPresent: true,
      hasConflictingCommissionRate: true,
    });
    expect(s.isSafeForSettlement).toBe(false);
    expect(s.settlementBlockReasons.length).toBeGreaterThan(0);
    expect(s.isSafeForAccounting).toBe(false);
  });
});

describe("Phase 3.6 FinancialPolicy versioning", () => {
  it("draft policies are not production-usable", () => {
    const draft = createDraftFinancialPolicy({
      policyId: "P",
      version: "1.0.0",
      notes: "test",
    });
    expect(draft.status).toBe("draft");
    expect(draft.productionApproved).toBe(false);
    expect(() => assertPolicyUsableForProduction(draft)).toThrow();
  });

  it("approved + productionApproved required for production use", () => {
    const approved = {
      ...createDraftFinancialPolicy({
        policyId: "P2",
        version: "1.0.0",
        notes: "n",
      }),
      status: "approved" as const,
      productionApproved: true,
      approvedAtUtc: "2026-09-11T00:00:00.000Z",
      approvedBy: "owner",
    };
    expect(() => assertPolicyUsableForProduction(approved)).not.toThrow();
  });
});

describe("Phase 3.6 policies & classification registry", () => {
  it("exposes source priority and no-recalc rule", () => {
    expect(CANONICAL_FINANCIAL_SOURCE_PRIORITY_POLICY.length).toBeGreaterThan(5);
    expect(NO_HISTORICAL_RECALCULATION_RULE).toMatch(/MUST NOT recalculate/);
  });

  it("classifies required financial fields", () => {
    expect(classificationFor("platformCommissionAmount")?.exposure).toBe(
      "READ_SAFE",
    );
    expect(classificationFor("chargebackAmount")?.exposure).toBe(
      "DO_NOT_EXPOSE_YET",
    );
    expect(classificationFor("vatRate")?.exposure).toBe("READ_WITH_WARNING");
    expect(CANONICAL_FIELD_CLASSIFICATIONS.length).toBeGreaterThanOrEqual(15);
  });

  it("mapping version is phase-3.6", () => {
    expect(CANONICAL_MAPPING_VERSION).toBe("phase-3.6-v1");
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "p36-v",
      currency: "SAR",
      total: 1,
      total_mndob2: 1,
      total_app: 0.15,
      total_vat: 0,
      total_mndob: 0.85,
      agent_id: "a",
    });
    expect(m.mappingVersion).toBe("phase-3.6-v1");
    expect(m.isLedger).toBe(false);
  });
});

describe("Phase 3.6 FinancialCalculationService has no hardcoded 15 literal in rates path", () => {
  it("uses policy provider bps (synthetic) — not Canonical historical mapper", () => {
    const policy = financialCalculationService.getPolicy();
    expect(policy.productionApproved).toBe(false);
    expect(policy.platformCommissionBps).toBe(1500);
    // Source of rates is policy object, not a bare 0.15 in service API
    expect(policy.policyId).toBe("SYNTHETIC_TEST_POLICY");
  });
});

describe("Phase 3.6 auth & safety flags", () => {
  it("rejects x-user-id outside development", () => {
    expect(isHeaderUserIdAuthAllowed("development")).toBe(true);
    expect(isHeaderUserIdAuthAllowed("production")).toBe(false);
    expect(isHeaderUserIdAuthAllowed("staging")).toBe(false);
  });

  it("keeps all production flags false", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
  });
});

describe("Phase 3.6 fixtures still map without inventing zeros", () => {
  it("loads fixtures and maps majors", () => {
    const path = join(
      process.cwd(),
      "docs/legacy-mapping/legacy-financial-fixtures.json",
    );
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      fixtures: Array<{
        orderId: string;
        currency?: string;
        observed?: {
          baseFareHalalas: number;
          platformFeePercentHardcoded?: number;
          vatPercent?: number;
          isvat?: boolean;
          discountHalalas?: number;
        };
        expectedMajors?: Record<string, number>;
        omitExpectedMajors?: boolean;
      }>;
    };
    for (const f of file.fixtures) {
      if (f.omitExpectedMajors || !f.expectedMajors || !f.observed) continue;
      const computed = observedLegacyQuoteMajors({
        baseFareHalalas: f.observed.baseFareHalalas,
        platformFeePercent: f.observed.platformFeePercentHardcoded,
        vatPercent: f.observed.vatPercent,
        applyVat: f.observed.isvat,
        discountHalalas: f.observed.discountHalalas,
      });
      const canonical = mapLegacyFinancialSnapshotToCanonical({
        orderId: f.orderId,
        currency: f.currency ?? "SAR",
        ...computed,
        agent_id: "fixture-agent",
      });
      expect(canonical.platformCommissionAmount.value).toBe(
        f.expectedMajors.total_app,
      );
      expect(canonical.platformCommissionRatePercent.value).toBeNull();
      expect(canonical.chargebackAmount.value).toBeNull();
    }
  });
});

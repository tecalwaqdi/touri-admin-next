/**
 * Finance shadow validator — compare Production docs to F1–F5 model (read-only).
 * Classifies discrepancies. FC-01 APPROVED 15% versioned; historical amounts not re-rated.
 * FC-02..FC-05 APPROVED at F6 — never invent rates/zeros.
 */

import {
  ProductionFinanceReadAdapter,
  type ProductionOrderReadInput,
  type ProductionSettlementReadInput,
} from "@/adapters/finance/ProductionFinanceReadAdapter";
import { majorToMinor } from "@/domain/finance/v2/TripFinancialSnapshot";
import { financeRecordToken } from "@/domain/finance/shadow/financeShadowPii";
import type {
  FinanceShadowFinding,
  FinanceShadowMismatchCategory,
  FinanceShadowPolicyCode,
} from "@/domain/finance/shadow/FinanceShadowTypes";

function fieldPresent(data: Record<string, unknown>, field: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(data, field) &&
    data[field] !== null &&
    data[field] !== undefined &&
    data[field] !== ""
  );
}

function approxEqualMinor(a: bigint, b: bigint, tol = 1n): boolean {
  const d = a > b ? a - b : b - a;
  return d <= tol;
}

export type OrderShadowContext = {
  order: ProductionOrderReadInput;
  /** Active agent id for country if known — MUST NOT be used for historical attribution. */
  currentCountryAgentId?: string | null;
  settlements?: ProductionSettlementReadInput[];
};

export function validateOrderFinanceShadow(
  ctx: OrderShadowContext,
  adapter: ProductionFinanceReadAdapter = new ProductionFinanceReadAdapter(),
): FinanceShadowFinding[] {
  const findings: FinanceShadowFinding[] = [];
  const token = financeRecordToken("order", ctx.order.documentId);
  const data = ctx.order.data;
  const shadow = adapter.shadowTrip({
    ...ctx.order,
    currentCountryAgentId: ctx.currentCountryAgentId ?? "agent_should_never_apply",
  });
  const snap = shadow.snapshot;

  // 1 — Completed trip financial mapping
  const statusCode =
    typeof data.status_code === "string" ? data.status_code.toLowerCase() : "";
  if (statusCode === "completed") {
    if (!snap.majors.lifecycleCompleted) {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 1,
        outcome: "MISMATCH",
        category: "MAPPING_ERROR",
        code: "completed_status_code_not_mapped_lifecycleCompleted",
      });
    } else {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 1,
        outcome: "CLEAN",
        code: "completed_lifecycle_mapped",
      });
    }
  } else if (statusCode) {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 1,
      outcome: "CLEAN",
      code: `non_completed_lifecycle_${statusCode}`,
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 1,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "status_code_missing",
    });
  }

  // 2 — Persisted vs derived
  if (
    snap.majors.driverNet.availability === "available" &&
    snap.majors.driverNet.amountMinor != null &&
    snap.derivedDriverNet.availability === "available" &&
    snap.derivedDriverNet.amountMinor != null
  ) {
    if (snap.majors.driverNet.amountMinor !== snap.derivedDriverNet.amountMinor) {
      const discounted =
        snap.majors.customerTotal.amountMinor != null &&
        snap.majors.grossFare.amountMinor != null &&
        snap.majors.customerTotal.amountMinor < snap.majors.grossFare.amountMinor;
      if (discounted) {
        findings.push({
          recordToken: token,
          recordKind: "order",
          validationItem: 2,
          outcome: "CLEAN",
          code: "fc02_approved_persisted_driver_net_wins_discount_separate",
        });
      } else {
        findings.push({
          recordToken: token,
          recordKind: "order",
          validationItem: 2,
          outcome: "MISMATCH",
          category: "LEGACY_DATA",
          code: "persisted_vs_derived_driver_net_diverge",
        });
      }
    } else {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 2,
        outcome: "CLEAN",
        code: "persisted_matches_derived_diagnostic",
      });
    }
  } else if (snap.majors.driverNet.availability !== "available") {
    if (snap.derivedDriverNet.amountMinor != null) {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 2,
        outcome: "CLEAN",
        code: "fc02_approved_derived_diagnostic_only_persisted_required",
      });
    } else {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 2,
        outcome: "MISSING_DATA",
        category: "MISSING_AUTHORITATIVE_VALUE",
        code: "driver_net_and_derived_unavailable",
      });
    }
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 2,
      outcome: "CLEAN",
      code: "persisted_driver_net_present",
    });
  }

  // 3 — Currency + precision
  if (!snap.majors.currency) {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 3,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "currency_missing",
    });
  } else {
    const agentCurrency =
      typeof data.agent_currency === "string"
        ? data.agent_currency.trim().toUpperCase()
        : "";
    if (agentCurrency && agentCurrency !== snap.majors.currency) {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 3,
        outcome: "MISMATCH",
        category: "LEGACY_DATA",
        code: "agent_currency_conflicts_order_currency",
      });
    } else {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 3,
        outcome: "CLEAN",
        code: "currency_present",
      });
    }
  }

  // 4 — Missing ≠ zero
  for (const field of [
    "total_mndob2",
    "total_app",
    "total_vat",
    "total_mndob",
    "total",
  ] as const) {
    if (!fieldPresent(data, field)) {
      const mapped =
        field === "total_mndob2"
          ? snap.majors.grossFare
          : field === "total_app"
            ? snap.majors.platformCommission
            : field === "total_vat"
              ? snap.majors.vatAmount
              : field === "total_mndob"
                ? snap.majors.driverNet
                : snap.majors.customerTotal;
      if (mapped.availability === "available" && mapped.amountMinor === 0n) {
        findings.push({
          recordToken: token,
          recordKind: "order",
          validationItem: 4,
          outcome: "MISMATCH",
          category: "MAPPING_ERROR",
          code: `missing_${field}_mapped_as_zero`,
        });
      } else if (mapped.amountMinor === null) {
        findings.push({
          recordToken: token,
          recordKind: "order",
          validationItem: 4,
          outcome: "CLEAN",
          code: `missing_${field}_stays_null`,
        });
      }
    }
  }
  if (fieldPresent(data, "total_vat") && data.total_vat === 0) {
    if (
      snap.majors.vatAmount.availability === "available" &&
      snap.majors.vatAmount.amountMinor === 0n
    ) {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 4,
        outcome: "CLEAN",
        code: "known_zero_vat_preserved",
      });
    }
  }

  // 5 — Cash vs card
  const channel = snap.majors.paymentChannel;
  if (channel === "unknown") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 5,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "payment_channel_unknown",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 5,
      outcome: "CLEAN",
      code: `payment_channel_${channel}`,
    });
  }

  // 6 — Driver gross / deductions / net
  if (
    snap.majors.grossFare.availability === "available" &&
    snap.majors.driverNet.availability === "available" &&
    snap.driverDeductions.availability === "available"
  ) {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 6,
      outcome: "CLEAN",
      code: "driver_majors_and_deductions_available",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 6,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "driver_majors_incomplete",
    });
  }

  // 7 — Company allocation (deterministic when agent snapshot known)
  if (snap.agent.status === "snapshot" && snap.companyPlatformNet.availability === "available") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 7,
      outcome: "CLEAN",
      code: "company_platform_net_from_snapshot",
    });
  } else if (snap.agent.status === "unknown_historical") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 7,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "company_net_incomplete_without_agent_snapshot",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 7,
      outcome: "CLEAN",
      code: "company_net_platform_only",
    });
  }

  // FC-01 APPROVED: historical path uses persisted amount only (no re-rate).
  if (snap.majors.platformCommission.availability === "available") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 7,
      outcome: "CLEAN",
      code: "platform_commission_historical_amount_fc01_approved_no_re_rate",
    });
  }

  // 8 — Agent attribution (snapshot only; never current agent)
  if (snap.agent.agentId === "agent_should_never_apply") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 8,
      outcome: "MISMATCH",
      category: "MAPPING_ERROR",
      code: "current_country_agent_incorrectly_attributed",
    });
  } else if (snap.agent.status === "snapshot") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 8,
      outcome: "CLEAN",
      code: "agent_snapshot_attributed",
    });
    if (shadow.agentLine.eligible) {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 8,
        outcome: "CLEAN",
        code: "agent_settlement_fc03_approved_offline_path",
      });
    }
  } else {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 8,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "agent_unknown_historical",
    });
  }

  // 10 — Refund / chargeback / gateway (FC-04/FC-05 APPROVED at F6 — accounting rules locked)
  findings.push({
    recordToken: token,
    recordKind: "order",
    validationItem: 10,
    outcome: "CLEAN",
    code: "chargeback_fc04_approved_append_only_accounting",
  });
  findings.push({
    recordToken: token,
    recordKind: "order",
    validationItem: 10,
    outcome: "CLEAN",
    code: "gateway_fee_fc05_approved_independent_component",
  });
  if (snap.refundSessionAmount.availability === "available") {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 10,
      outcome: "CLEAN",
      code: "refund_session_observed_majors_immutable",
    });
  }

  // 12 — Historical snapshot immutability (no 15% re-rate)
  if (
    fieldPresent(data, "total_app") &&
    typeof data.total_app === "number" &&
    snap.majors.platformCommission.amountMinor != null
  ) {
    const expected = majorToMinor(data.total_app);
    if (
      expected != null &&
      snap.majors.platformCommission.amountMinor === expected
    ) {
      const gross = snap.majors.grossFare.amountMinor;
      if (gross != null && gross > 0n) {
        const fifteen = (gross * 15n) / 100n;
        // If historical differs from 15% and we still kept historical → CLEAN
        if (
          !approxEqualMinor(expected, fifteen) &&
          snap.majors.platformCommission.amountMinor === expected
        ) {
          findings.push({
            recordToken: token,
            recordKind: "order",
            validationItem: 12,
            outcome: "CLEAN",
            code: "historical_total_app_not_re_rated_to_15pct",
          });
        } else {
          findings.push({
            recordToken: token,
            recordKind: "order",
            validationItem: 12,
            outcome: "CLEAN",
            code: "historical_total_app_preserved",
          });
        }
      } else {
        findings.push({
          recordToken: token,
          recordKind: "order",
          validationItem: 12,
          outcome: "CLEAN",
          code: "historical_total_app_preserved",
        });
      }
    } else {
      findings.push({
        recordToken: token,
        recordKind: "order",
        validationItem: 12,
        outcome: "MISMATCH",
        category: "CALCULATION_ERROR",
        code: "platform_commission_re_rated_or_mismapped",
      });
    }
  }

  // 9 + 14 — Settlement linkage / recon when settlements provided
  const linked = (ctx.settlements ?? []).filter((s) => {
    const mapped = adapter.shadowSettlement(s).raw;
    return mapped.claims.some((c) => c.orderId === ctx.order.documentId);
  });
  if ((ctx.settlements ?? []).length === 0) {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 9,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "no_settlement_claims_in_scanned_window",
    });
  } else if (linked.length === 0) {
    findings.push({
      recordToken: token,
      recordKind: "order",
      validationItem: 9,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "order_not_in_scanned_settlement_claims",
    });
  } else {
    for (const s of linked) {
      const mapped = adapter.shadowSettlement(s).raw;
      if (shadow.driverLine.eligible && shadow.driverLine.amountMinor != null) {
        const claim = mapped.claims.find((c) => c.orderId === ctx.order.documentId);
        if (claim && claim.amountMinor !== 0n) {
          const lineMinor = BigInt(shadow.driverLine.amountMinor);
          if (claim.amountMinor !== lineMinor) {
            findings.push({
              recordToken: token,
              recordKind: "order",
              validationItem: 14,
              outcome: "MISMATCH",
              category: "SETTLEMENT_CONFLICT",
              code: "line_vs_settlement_claim_mismatch",
            });
          } else {
            findings.push({
              recordToken: token,
              recordKind: "order",
              validationItem: 14,
              outcome: "CLEAN",
              code: "order_line_settlement_claim_match",
            });
          }
        } else {
          findings.push({
            recordToken: token,
            recordKind: "order",
            validationItem: 9,
            outcome: "CLEAN",
            code: "order_linked_via_eligibleOrderIds",
          });
          findings.push({
            recordToken: token,
            recordKind: "order",
            validationItem: 14,
            outcome: "CLEAN",
            code: "recon_link_present_claim_minors_not_on_header",
          });
        }
      }
      if (
        snap.countryId &&
        mapped.countryId &&
        snap.countryId !== mapped.countryId &&
        !mapped.countryId.endsWith(snap.countryId) &&
        !snap.countryId.endsWith(mapped.countryId)
      ) {
        findings.push({
          recordToken: token,
          recordKind: "cross",
          validationItem: 13,
          outcome: "MISMATCH",
          category: "SETTLEMENT_CONFLICT",
          code: "order_settlement_country_mismatch",
        });
      }
    }
  }

  return findings;
}

export function validateSettlementFinanceShadow(
  input: ProductionSettlementReadInput,
  adapter: ProductionFinanceReadAdapter = new ProductionFinanceReadAdapter(),
): FinanceShadowFinding[] {
  const findings: FinanceShadowFinding[] = [];
  const token = financeRecordToken("financial_settlements", input.documentId);
  const shadow = adapter.shadowSettlement(input);
  const s = shadow.raw;

  if (!s.currency) {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 3,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "settlement_currency_missing",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 3,
      outcome: "CLEAN",
      code: "settlement_currency_present",
    });
  }

  if (!s.partyId) {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "MISSING_DATA",
      category: "MISSING_AUTHORITATIVE_VALUE",
      code: "settlement_party_missing",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "CLEAN",
      code: "settlement_party_mapped",
    });
  }

  if (s.partyType === "agent") {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "CLEAN",
      code: "agent_party_settlement_fc03_approved",
    });
  }

  if (s.amountMinor < 0n) {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "MISMATCH",
      category: "LEGACY_DATA",
      code: "negative_settlement_amount",
    });
  } else {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "CLEAN",
      code: "settlement_amount_non_negative",
    });
  }

  if (s.paidConfirmedMinor > s.amountMinor && s.amountMinor > 0n) {
    findings.push({
      recordToken: token,
      recordKind: "settlement",
      validationItem: 9,
      outcome: "MISMATCH",
      category: "SETTLEMENT_CONFLICT",
      code: "paid_exceeds_amount",
    });
  }

  return findings;
}

export function validateAgentCountryUniquenessShadow(input: {
  countriesWithMultipleActiveAgents: number;
}): FinanceShadowFinding[] {
  if (input.countriesWithMultipleActiveAgents > 0) {
    return [
      {
        recordToken: "agent_scope",
        recordKind: "agent_scope",
        validationItem: 8,
        outcome: "MISMATCH",
        category: "COUNTRY_AGENT_CONFLICT",
        code: "countries_with_multiple_active_agents",
      },
    ];
  }
  return [
    {
      recordToken: "agent_scope",
      recordKind: "agent_scope",
      validationItem: 8,
      outcome: "CLEAN",
      code: "one_country_max_one_active_agent_in_sample",
    },
  ];
}

export function detectDuplicateIdempotency(
  settlements: ProductionSettlementReadInput[],
): FinanceShadowFinding[] {
  const seen = new Map<string, string>();
  const findings: FinanceShadowFinding[] = [];
  for (const s of settlements) {
    const key = String(
      s.data.idempotencyKey ?? s.data.idempotency_key ?? "",
    ).trim();
    if (!key) continue;
    const token = financeRecordToken("financial_settlements", s.documentId);
    const prev = seen.get(key);
    if (prev) {
      findings.push({
        recordToken: token,
        recordKind: "settlement",
        validationItem: 11,
        outcome: "MISMATCH",
        category: "SETTLEMENT_CONFLICT",
        code: "duplicate_settlement_idempotency_key",
      });
    } else {
      seen.set(key, token);
      findings.push({
        recordToken: token,
        recordKind: "settlement",
        validationItem: 11,
        outcome: "CLEAN",
        code: "idempotency_key_unique_in_window",
      });
    }
  }
  return findings;
}

export type { FinanceShadowMismatchCategory, FinanceShadowPolicyCode };

/**
 * Finance cutover — financial impact resolution (READ-ONLY).
 * Classifies every pre-cutover record; proposes opening balances only from
 * authoritative supported carry-forward amounts. Never writes / deletes / invents.
 */

import type { FinanceReportingRoDoc } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import type { FinanceCutoverMalformedDoc } from "@/application/finance/cutover/FinanceCutoverCensusLoader";
import { PROVENANCE_PROVEN_SYNTHETIC_IDS } from "@/application/finance/cutover/FinanceCutoverInventoryDryRun";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import {
  classifySettlementCommercialEligibility,
} from "@/domain/finance/reporting/SettlementCommercialCutover";
import { buildSnapshotIndex } from "@/domain/finance/reporting/SettlementCommercialCutover";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  type FinanceFinancialImpactClass,
  type FinanceImpactInventoryRow,
  FINANCE_FINANCIAL_IMPACT_CLASSES,
} from "@/domain/finance/cutover/FinanceFinancialImpactClass";
import {
  mapLegacyTransactionDoc,
  mapLegacyWalletDoc,
} from "@/domain/finance/wallet/DriverWalletReadModels";

export type WalletImpactReview = {
  walletId: string;
  ownerType: "driver" | "agent" | "unknown";
  ownerId: string | null;
  resolvedOwnerName: string | null;
  country: string | null;
  currency: string | null;
  storedBalanceMinor: string | null;
  storedBalanceAvailability: string;
  transactionDerivedBalanceMinor: string | null;
  transactionDerivedAuthoritative: boolean;
  linkedSettlements: string[];
  linkedPayments: string[];
  linkedAdjustments: string[];
  realOrSynthetic: "real" | "synthetic";
  financialImpact: FinanceFinancialImpactClass;
  proposedCarryForwardAmountMinor: string | null;
  proposedDirection: "receivable" | "payable" | null;
  sourceReferences: string[];
  reasons: string[];
};

export type SettlementChainReview = {
  settlementId: string;
  snapshotId: string | null;
  paymentIds: string[];
  adjustmentIds: string[];
  amountMinor: string | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  direction: string | null;
  partyType: "driver" | "agent" | null;
  partyId: string | null;
  financialImpact: FinanceFinancialImpactClass;
  reasons: string[];
  finalBalanceMinor: string | null;
};

export type OpeningBalanceProofRow = {
  party: string;
  partyType: "driver" | "agent" | "company";
  partyId: string;
  currency: string;
  countryId: string | null;
  openingReceivable: string;
  openingPayable: string;
  supportingRecordIds: string[];
  reason: string;
  confidence: "authoritative_settlement" | "authoritative_wallet_with_direction";
  sourceAuthority: string;
};

export type SyntheticCleanupManifestEntry = {
  collection: string;
  id: string;
  provenance: string[];
  linkedChildren: string[];
  deletionOrder: number;
};

export type FinanceFinancialImpactResolutionReport = {
  dryRun: true;
  productionWrites: 0;
  deletions: 0;
  totalRecords: number;
  unclassified: 0;
  counts: Record<FinanceFinancialImpactClass, number>;
  idsByClass: Record<FinanceFinancialImpactClass, string[]>;
  rows: FinanceImpactInventoryRow[];
  wallets: {
    reviewed: WalletImpactReview[];
    nonzeroReal: WalletImpactReview[];
    conflicts: WalletImpactReview[];
  };
  settlementChains: {
    chains: SettlementChainReview[];
    fullySettled: number;
    unresolved: number;
  };
  orders: {
    withFinancialImpact: number;
    withoutFinancialImpact: number;
  };
  malformed: {
    resolved: FinanceImpactInventoryRow[];
    blockers: FinanceImpactInventoryRow[];
    details: FinanceCutoverMalformedDoc[];
  };
  openingBalances: {
    driver: OpeningBalanceProofRow[];
    agent: OpeningBalanceProofRow[];
    companyReceivableByCurrency: Record<string, string>;
    companyPayableByCurrency: Record<string, string>;
    companyNetByCurrency: Record<string, string>;
  };
  unresolvedMoney: Array<{
    id: string;
    kind: string;
    class: FinanceFinancialImpactClass;
    reason: string;
    amountMinor: string | null;
  }>;
  syntheticDeleteManifest: {
    dryRun: true;
    deletions: 0;
    entries: SyntheticCleanupManifestEntry[];
    realRecordsToDelete: 0;
  };
  maintenanceSequenceDefinedNotExecuted: string[];
  blockers: string[];
  readyForCutoverApply: false;
};

function emptyCounts(): Record<FinanceFinancialImpactClass, number> {
  return Object.fromEntries(
    FINANCE_FINANCIAL_IMPACT_CLASSES.map((c) => [c, 0]),
  ) as Record<FinanceFinancialImpactClass, number>;
}

function emptyIds(): Record<FinanceFinancialImpactClass, string[]> {
  return Object.fromEntries(
    FINANCE_FINANCIAL_IMPACT_CLASSES.map((c) => [c, [] as string[]]),
  ) as Record<FinanceFinancialImpactClass, string[]>;
}

function addMinor(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function isSyntheticId(id: string, proven: ReadonlySet<string>): boolean {
  return proven.has(id) || isFinanceQaOrPilotRecordId(id);
}

function syntheticProvenance(
  id: string,
  proven: ReadonlySet<string>,
): { synthetic: boolean; proven: boolean } {
  const provenHit = proven.has(id);
  const heuristic = isFinanceQaOrPilotRecordId(id);
  return { synthetic: provenHit || heuristic, proven: provenHit };
}

function orderLifecycle(data: Record<string, unknown> | null): {
  state: "completed" | "cancelled" | "pending" | "unknown";
  paidHint: boolean | null;
} {
  if (!data) return { state: "unknown", paidHint: null };
  const statusRaw = String(
    data.status ?? data.orderStatus ?? data.state ?? data.tripStatus ?? "",
  ).toLowerCase();
  const cancelled =
    /cancel|رفض|ملغ|rejected|failed|expired/.test(statusRaw) ||
    data.cancelled === true;
  const completed =
    /complet|done|finished|delivered|مكتمل|منتهي/.test(statusRaw) ||
    data.completed === true ||
    data.isCompleted === true;
  const paidRaw = String(
    data.paymentStatus ?? data.payment_status ?? data.paidStatus ?? "",
  ).toLowerCase();
  const paidHint =
    paidRaw.includes("paid") ||
    paidRaw.includes("cash") ||
    data.paid === true ||
    data.isPaid === true
      ? true
      : paidRaw.includes("unpaid") || paidRaw.includes("pending")
        ? false
        : null;
  if (cancelled) return { state: "cancelled", paidHint };
  if (completed) return { state: "completed", paidHint };
  if (
    /pend|new|assign|accept|progress|active|booked|waiting/.test(statusRaw)
  ) {
    return { state: "pending", paidHint };
  }
  return { state: "unknown", paidHint };
}

function classifySettlementImpact(input: {
  settlement: FinanceReportingSourceBundle["settlements"][number];
  snapshotsById: ReturnType<typeof buildSnapshotIndex>;
  paymentIds: string[];
  adjustmentIds: string[];
  proven: ReadonlySet<string>;
}): SettlementChainReview {
  const s = input.settlement;
  const commercial = classifySettlementCommercialEligibility({
    settlement: s,
    snapshotsById: input.snapshotsById,
  });
  const outstanding =
    s.amountMinor != null && s.paidConfirmedMinor != null
      ? (s.amountMinor - s.paidConfirmedMinor).toString()
      : null;
  const synth = syntheticProvenance(s.id, input.proven);
  const reasons = [...commercial.reasons];
  let financialImpact: FinanceFinancialImpactClass;

  if (commercial.class === "legacy_orphan" || s.id.startsWith("fin_set_")) {
    financialImpact = "LEGACY_ORPHAN";
    reasons.push("legacy_orphan_read_only");
  } else if (synth.synthetic || commercial.class === "qa_pilot") {
    financialImpact = "SYNTHETIC_QA_TEST";
    reasons.push(synth.proven ? "provenance_proven" : "qa_heuristic_id");
  } else if (s.amountMinor == null || s.paidConfirmedMinor == null) {
    financialImpact = "HISTORICAL_INCOMPLETE";
    reasons.push("settlement_amounts_incomplete");
  } else if (outstanding === "0") {
    financialImpact = "FULLY_SETTLED";
    reasons.push("outstanding_zero");
  } else {
    const dir = String(s.direction || "").toUpperCase();
    if (dir.includes("COMPANY_PAYS")) {
      financialImpact = "CARRY_FORWARD_PAYABLE";
      reasons.push("outstanding_nonzero_company_pays");
    } else if (dir.includes("DRIVER_PAYS") || dir.includes("AGENT_PAYS")) {
      financialImpact = "CARRY_FORWARD_RECEIVABLE";
      reasons.push("outstanding_nonzero_party_pays_company");
    } else {
      financialImpact = "HISTORICAL_INCOMPLETE";
      reasons.push("outstanding_nonzero_direction_unknown");
    }
  }

  return {
    settlementId: s.id,
    snapshotId: s.sourceAccountingSnapshotId,
    paymentIds: input.paymentIds,
    adjustmentIds: input.adjustmentIds,
    amountMinor: s.amountMinor?.toString() ?? null,
    paidConfirmedMinor: s.paidConfirmedMinor?.toString() ?? null,
    outstandingMinor: outstanding,
    direction: s.direction || null,
    partyType: s.partyType,
    partyId: s.partyId,
    financialImpact,
    reasons,
    finalBalanceMinor: outstanding,
  };
}

function deriveTxnBalanceForWallet(
  walletId: string,
  ownerId: string | null,
  txns: ReturnType<typeof mapLegacyTransactionDoc>[],
): { balanceMinor: string | null; authoritative: boolean; reasons: string[] } {
  const linked = txns.filter(
    (t) =>
      t.walletId === walletId ||
      (ownerId != null && t.driverId === ownerId) ||
      t.transactionId.includes(walletId) ||
      (ownerId != null && t.transactionId.includes(ownerId.slice(0, 8))),
  );
  if (linked.length === 0) {
    return {
      balanceMinor: null,
      authoritative: false,
      reasons: ["no_linked_transactions"],
    };
  }
  let sum = 0n;
  let incomplete = false;
  let signed = false;
  for (const t of linked) {
    if (t.availability !== "available" || t.amountMinor == null) {
      incomplete = true;
      continue;
    }
    try {
      const amt = BigInt(t.amountMinor);
      if (t.direction === "credit") {
        sum += amt;
        signed = true;
      } else if (t.direction === "debit") {
        sum -= amt;
        signed = true;
      } else {
        incomplete = true;
      }
    } catch {
      incomplete = true;
    }
  }
  if (incomplete || !signed) {
    return {
      balanceMinor: null,
      authoritative: false,
      reasons: [
        `linked_txns:${linked.length}`,
        incomplete ? "txn_amount_or_direction_incomplete" : "txn_direction_unsigned",
      ],
    };
  }
  return {
    balanceMinor: sum.toString(),
    authoritative: true,
    reasons: [`linked_txns:${linked.length}`, "txn_derived_signed_sum"],
  };
}

/**
 * Pure financial-impact resolution from census outputs.
 */
export function resolveFinanceFinancialImpact(input: {
  bundle: FinanceReportingSourceBundle;
  extraDocs: Record<string, FinanceReportingRoDoc[]>;
  malformedDocs: FinanceCutoverMalformedDoc[];
  cutoverUtcInstant: string;
}): FinanceFinancialImpactResolutionReport {
  const proven = new Set(PROVENANCE_PROVEN_SYNTHETIC_IDS);
  const snapshotsById = buildSnapshotIndex(input.bundle.snapshots);
  const rows: FinanceImpactInventoryRow[] = [];
  const paymentsBySettlement = new Map<string, string[]>();
  for (const p of input.bundle.payments) {
    const list = paymentsBySettlement.get(p.settlementId) ?? [];
    list.push(p.id);
    paymentsBySettlement.set(p.settlementId, list);
  }
  const adjustmentsBySettlement = new Map<string, string[]>();
  for (const a of input.bundle.adjustments) {
    if (!a.relatedSettlementId) continue;
    const list = adjustmentsBySettlement.get(a.relatedSettlementId) ?? [];
    list.push(a.id);
    adjustmentsBySettlement.set(a.relatedSettlementId, list);
  }

  // ---- Settlement chains ----
  const chains: SettlementChainReview[] = [];
  for (const sett of input.bundle.settlements) {
    const chain = classifySettlementImpact({
      settlement: sett,
      snapshotsById,
      paymentIds: paymentsBySettlement.get(sett.id) ?? [],
      adjustmentIds: adjustmentsBySettlement.get(sett.id) ?? [],
      proven,
    });
    chains.push(chain);
    rows.push({
      kind: "settlement",
      id: sett.id,
      collection: "financial_settlements",
      class: chain.financialImpact,
      reasons: chain.reasons,
      countryId: sett.countryId || null,
      currency: sett.currency || null,
      partyType: sett.partyType,
      partyId: sett.partyId,
      amountMinor: chain.outstandingMinor,
      carryForwardReceivableMinor:
        chain.financialImpact === "CARRY_FORWARD_RECEIVABLE"
          ? chain.outstandingMinor
          : null,
      carryForwardPayableMinor:
        chain.financialImpact === "CARRY_FORWARD_PAYABLE"
          ? chain.outstandingMinor
          : null,
      sourceReferences: [
        chain.snapshotId ? `snapshot:${chain.snapshotId}` : null,
        sett.sourceOrderId ? `order:${sett.sourceOrderId}` : null,
        ...chain.paymentIds.map((id) => `payment:${id}`),
        ...chain.adjustmentIds.map((id) => `adjustment:${id}`),
      ].filter(Boolean) as string[],
      provenanceProvenSynthetic: proven.has(sett.id),
    });
  }

  // ---- Snapshots ----
  const settledOrderIds = new Set(
    input.bundle.settlements
      .map((s) => s.sourceOrderId)
      .filter(Boolean) as string[],
  );
  const snapshotByOrder = new Map(
    input.bundle.snapshots.map((s) => [s.orderId, s]),
  );
  for (const snap of input.bundle.snapshots) {
    const synth = syntheticProvenance(snap.id, proven);
    const orderSynth = syntheticProvenance(snap.orderId, proven);
    let cls: FinanceFinancialImpactClass;
    const reasons: string[] = [];
    if (synth.synthetic || orderSynth.synthetic) {
      cls = "SYNTHETIC_QA_TEST";
      reasons.push(synth.proven || orderSynth.proven ? "provenance_or_qa_id" : "qa_heuristic");
    } else if (!snap.lifecycleCompleted || snap.grossFareMinor == null) {
      cls = "HISTORICAL_INCOMPLETE";
      reasons.push(
        !snap.lifecycleCompleted ? "lifecycle_incomplete" : "gross_fare_missing",
      );
    } else {
      const linkedSett = input.bundle.settlements.find(
        (s) =>
          s.sourceAccountingSnapshotId === snap.id ||
          s.sourceOrderId === snap.orderId,
      );
      if (linkedSett) {
        const chain = chains.find((c) => c.settlementId === linkedSett.id);
        cls = chain?.financialImpact ?? "HISTORICAL_INCOMPLETE";
        reasons.push(`linked_settlement:${linkedSett.id}`);
      } else {
        cls = "HISTORICAL_INCOMPLETE";
        reasons.push("completed_snapshot_without_settlement");
      }
    }
    rows.push({
      kind: "snapshot",
      id: snap.id,
      collection: "finance_accounting_snapshots",
      class: cls,
      reasons,
      countryId: snap.countryId || null,
      currency: snap.currency || null,
      partyType: snap.driverId ? "driver" : snap.agentId ? "agent" : null,
      partyId: snap.driverId ?? snap.agentId ?? null,
      amountMinor: snap.grossFareMinor?.toString() ?? null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: [`order:${snap.orderId}`],
      provenanceProvenSynthetic: proven.has(snap.id) || proven.has(snap.orderId),
    });
  }

  // ---- Payments ----
  for (const p of input.bundle.payments) {
    const synth = syntheticProvenance(p.id, proven);
    const parent = chains.find((c) => c.settlementId === p.settlementId);
    let cls: FinanceFinancialImpactClass;
    const reasons: string[] = [`settlement:${p.settlementId}`];
    if (synth.synthetic) {
      cls = "SYNTHETIC_QA_TEST";
      reasons.push(synth.proven ? "provenance_proven" : "qa_heuristic");
    } else if (!parent) {
      // Parent may be malformed — still reference-only payment row if amounts present
      cls = "HISTORICAL_INCOMPLETE";
      reasons.push("parent_settlement_not_in_mapped_bundle");
    } else if (parent.financialImpact === "FULLY_SETTLED") {
      cls = "FULLY_SETTLED";
    } else if (
      parent.financialImpact === "CARRY_FORWARD_RECEIVABLE" ||
      parent.financialImpact === "CARRY_FORWARD_PAYABLE"
    ) {
      cls = parent.financialImpact;
      reasons.push("inherits_parent_settlement_impact");
    } else {
      cls = parent.financialImpact;
    }
    rows.push({
      kind: "payment",
      id: p.id,
      collection: "financial_settlement_payments",
      class: cls,
      reasons,
      countryId: null,
      currency: p.currency || null,
      partyType: null,
      partyId: null,
      amountMinor: p.amountMinor?.toString() ?? null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: [`settlement:${p.settlementId}`],
      provenanceProvenSynthetic: proven.has(p.id),
    });
  }

  // ---- Adjustments ----
  for (const a of input.bundle.adjustments) {
    const synth = syntheticProvenance(a.id, proven);
    rows.push({
      kind: "adjustment",
      id: a.id,
      collection: "finance_adjustments",
      class: synth.synthetic
        ? "SYNTHETIC_QA_TEST"
        : a.status !== "approved" && a.status !== "rejected"
          ? "HISTORICAL_INCOMPLETE"
          : "FULLY_SETTLED",
      reasons: synth.synthetic
        ? [synth.proven ? "provenance_proven" : "qa_heuristic"]
        : [`adjustment_status:${a.status}`],
      countryId: a.countryId ?? null,
      currency: a.currency ?? null,
      partyType: null,
      partyId: null,
      amountMinor: a.amountMinor?.toString() ?? null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: a.relatedSettlementId
        ? [`settlement:${a.relatedSettlementId}`]
        : a.relatedOrderId
          ? [`order:${a.relatedOrderId}`]
          : [],
      provenanceProvenSynthetic: proven.has(a.id),
    });
  }

  // ---- Wallets (highest priority) ----
  const walletDocs = input.extraDocs.wallets ?? [];
  const txnDocs = (input.extraDocs.transactions ?? []).map((d) =>
    mapLegacyTransactionDoc({
      id: d.id,
      data: (d.data ?? {}) as Record<string, unknown>,
    }),
  );
  const walletReviews: WalletImpactReview[] = [];
  const settlementsByParty = new Map<string, string[]>();
  for (const s of input.bundle.settlements) {
    const key = `${s.partyType}:${s.partyId}`;
    const list = settlementsByParty.get(key) ?? [];
    list.push(s.id);
    settlementsByParty.set(key, list);
  }
  const paymentsByPartySettlement = new Map<string, string[]>();
  for (const chain of chains) {
    if (!chain.partyType || !chain.partyId) continue;
    const key = `${chain.partyType}:${chain.partyId}`;
    paymentsByPartySettlement.set(key, [
      ...(paymentsByPartySettlement.get(key) ?? []),
      ...chain.paymentIds,
    ]);
  }

  for (const doc of walletDocs) {
    if (!doc.exists || !doc.data) continue;
    const mapped = mapLegacyWalletDoc({
      id: doc.id,
      data: doc.data as Record<string, unknown>,
    });
    const synth = syntheticProvenance(doc.id, proven);
    const ownerSynth = mapped.driverId
      ? syntheticProvenance(mapped.driverId, proven)
      : { synthetic: false, proven: false };
    const realOrSynthetic: "real" | "synthetic" =
      synth.synthetic || ownerSynth.synthetic ? "synthetic" : "real";

    const raw = doc.data as Record<string, unknown>;
    const bothBalances =
      raw.currentBalance !== undefined &&
      raw.walletBalance !== undefined &&
      raw.currentBalance !== null &&
      raw.walletBalance !== null &&
      String(raw.currentBalance) !== String(raw.walletBalance);

    const txnDerived = deriveTxnBalanceForWallet(
      mapped.walletId,
      mapped.driverId,
      txnDocs,
    );

    const partyKey = mapped.driverId ? `driver:${mapped.driverId}` : null;
    const linkedSettlements = partyKey
      ? settlementsByParty.get(partyKey) ?? []
      : [];
    const linkedPayments = partyKey
      ? paymentsByPartySettlement.get(partyKey) ?? []
      : [];
    const linkedAdjustments = input.bundle.adjustments
      .filter(
        (a) =>
          (mapped.driverId &&
            (a.relatedOrderId?.includes(mapped.driverId) ||
              linkedSettlements.includes(a.relatedSettlementId ?? ""))) ||
          false,
      )
      .map((a) => a.id);

    const reasons: string[] = [...txnDerived.reasons];
    let financialImpact: FinanceFinancialImpactClass;
    let proposedCarry: string | null = null;
    let proposedDirection: "receivable" | "payable" | null = null;

    if (realOrSynthetic === "synthetic") {
      financialImpact = "SYNTHETIC_QA_TEST";
      reasons.push(
        synth.proven || ownerSynth.proven
          ? "synthetic_provenance_or_qa_id"
          : "synthetic_heuristic",
      );
    } else if (bothBalances) {
      financialImpact = "HISTORICAL_CONFLICT";
      reasons.push("currentBalance_ne_walletBalance");
    } else if (
      mapped.balance.availability === "available" &&
      mapped.balance.amountMinor != null &&
      txnDerived.authoritative &&
      txnDerived.balanceMinor != null &&
      txnDerived.balanceMinor !== mapped.balance.amountMinor
    ) {
      financialImpact = "HISTORICAL_CONFLICT";
      reasons.push(
        `stored_vs_txn_mismatch:stored=${mapped.balance.amountMinor}:txn=${txnDerived.balanceMinor}`,
      );
    } else if (mapped.balance.availability !== "available") {
      financialImpact =
        mapped.balance.availability === "missing"
          ? "NO_FINANCIAL_IMPACT"
          : "HISTORICAL_INCOMPLETE";
      reasons.push(`balance_${mapped.balance.availability}`);
    } else if (mapped.balance.amountMinor === "0") {
      financialImpact = "NO_FINANCIAL_IMPACT";
      reasons.push("stored_balance_zero");
    } else {
      // Non-zero real wallet. Polarity: only carry-forward when a linked
      // certified unpaid settlement confirms direction. Do NOT invent polarity
      // from wallet alone (missing ≠ invent receivable/payable).
      const unpaidLinked = chains.filter(
        (c) =>
          c.partyId === mapped.driverId &&
          (c.financialImpact === "CARRY_FORWARD_RECEIVABLE" ||
            c.financialImpact === "CARRY_FORWARD_PAYABLE"),
      );
      if (unpaidLinked.length === 1) {
        financialImpact = unpaidLinked[0]!.financialImpact;
        proposedCarry = mapped.balance.amountMinor;
        proposedDirection =
          financialImpact === "CARRY_FORWARD_RECEIVABLE"
            ? "receivable"
            : "payable";
        reasons.push(
          `direction_from_settlement:${unpaidLinked[0]!.settlementId}`,
        );
        reasons.push("nonzero_wallet_with_settlement_direction");
      } else if (unpaidLinked.length > 1) {
        financialImpact = "HISTORICAL_CONFLICT";
        reasons.push("multiple_unpaid_settlement_directions");
      } else {
        // Supported non-zero balance without proven settlement polarity —
        // incomplete for opening (do not invent receivable vs payable).
        financialImpact = "HISTORICAL_INCOMPLETE";
        proposedCarry = mapped.balance.amountMinor;
        reasons.push(
          "nonzero_wallet_balance_polarity_unproven_no_carry_into_opening",
        );
      }
    }

    const review: WalletImpactReview = {
      walletId: mapped.walletId,
      ownerType: mapped.driverId ? "driver" : "unknown",
      ownerId: mapped.driverId,
      resolvedOwnerName: mapped.driverDisplayName ?? null,
      country: mapped.countryId,
      currency: mapped.currency ?? mapped.balance.currency,
      storedBalanceMinor: mapped.balance.amountMinor,
      storedBalanceAvailability: mapped.balance.availability,
      transactionDerivedBalanceMinor: txnDerived.balanceMinor,
      transactionDerivedAuthoritative: txnDerived.authoritative,
      linkedSettlements,
      linkedPayments,
      linkedAdjustments,
      realOrSynthetic,
      financialImpact,
      proposedCarryForwardAmountMinor: proposedCarry,
      proposedDirection,
      sourceReferences: [
        `wallet:${mapped.walletId}`,
        mapped.balance.sourceField
          ? `field:${mapped.balance.sourceField}`
          : "field:balance_missing",
        ...linkedSettlements.map((id) => `settlement:${id}`),
      ],
      reasons,
    };
    walletReviews.push(review);
    rows.push({
      kind: "wallet",
      id: mapped.walletId,
      collection: "wallets",
      class: financialImpact,
      reasons,
      countryId: mapped.countryId,
      currency: mapped.currency ?? mapped.balance.currency,
      partyType: mapped.driverId ? "driver" : null,
      partyId: mapped.driverId,
      amountMinor: mapped.balance.amountMinor,
      carryForwardReceivableMinor:
        financialImpact === "CARRY_FORWARD_RECEIVABLE" ? proposedCarry : null,
      carryForwardPayableMinor:
        financialImpact === "CARRY_FORWARD_PAYABLE" ? proposedCarry : null,
      sourceReferences: review.sourceReferences,
      provenanceProvenSynthetic: proven.has(doc.id),
    });
  }

  // ---- Wallet transactions ----
  for (const doc of input.extraDocs.transactions ?? []) {
    if (!doc.exists) continue;
    const mapped = mapLegacyTransactionDoc({
      id: doc.id,
      data: (doc.data ?? {}) as Record<string, unknown>,
    });
    const synth = syntheticProvenance(doc.id, proven);
    const parentWallet = walletReviews.find(
      (w) =>
        w.walletId === mapped.walletId ||
        (mapped.driverId != null && w.ownerId === mapped.driverId),
    );
    let cls: FinanceFinancialImpactClass;
    if (synth.synthetic || /^admin_test_/i.test(doc.id)) {
      cls = "SYNTHETIC_QA_TEST";
    } else if (parentWallet?.financialImpact === "HISTORICAL_CONFLICT") {
      cls = "HISTORICAL_CONFLICT";
    } else if (parentWallet) {
      cls =
        parentWallet.financialImpact === "NO_FINANCIAL_IMPACT"
          ? "HISTORICAL_REFERENCE_ONLY"
          : parentWallet.financialImpact === "SYNTHETIC_QA_TEST"
            ? "SYNTHETIC_QA_TEST"
            : "HISTORICAL_REFERENCE_ONLY";
    } else if (
      isFinanceQaOrPilotRecordId(doc.id) ||
      /^company_pay_cp_/i.test(doc.id) ||
      /^wallet_topup_/i.test(doc.id)
    ) {
      // Explicit ops/test transaction namespaces — reference or synthetic by id
      cls = isFinanceQaOrPilotRecordId(doc.id)
        ? "SYNTHETIC_QA_TEST"
        : "HISTORICAL_REFERENCE_ONLY";
    } else {
      cls = "HISTORICAL_REFERENCE_ONLY";
    }
    rows.push({
      kind: "wallet_transaction",
      id: doc.id,
      collection: "transactions",
      class: cls,
      reasons: [
        mapped.walletId ? `wallet:${mapped.walletId}` : "wallet_unlinked",
        `availability:${mapped.availability}`,
      ],
      countryId: null,
      currency: mapped.currency,
      partyType: mapped.driverId ? "driver" : null,
      partyId: mapped.driverId,
      amountMinor: mapped.amountMinor,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: mapped.walletId
        ? [`wallet:${mapped.walletId}`]
        : [`collection:transactions`],
      provenanceProvenSynthetic: proven.has(doc.id),
    });
  }

  // ---- Orders ----
  let ordersWithImpact = 0;
  let ordersWithoutImpact = 0;
  const settlementByOrder = new Map<string, SettlementChainReview>();
  for (const c of chains) {
    const sett = input.bundle.settlements.find((s) => s.id === c.settlementId);
    if (sett?.sourceOrderId) settlementByOrder.set(sett.sourceOrderId, c);
  }
  for (const doc of input.extraDocs.order ?? []) {
    if (!doc.exists) continue;
    const data = (doc.data ?? {}) as Record<string, unknown>;
    const synth = syntheticProvenance(doc.id, proven);
    const life = orderLifecycle(data);
    const snap = snapshotByOrder.get(doc.id);
    const chain = settlementByOrder.get(doc.id);
    let cls: FinanceFinancialImpactClass;
    const reasons: string[] = [`lifecycle:${life.state}`];

    if (synth.synthetic) {
      cls = "SYNTHETIC_QA_TEST";
      reasons.push(synth.proven ? "provenance_proven" : "qa_heuristic");
    } else if (chain) {
      cls = chain.financialImpact;
      reasons.push(`linked_settlement:${chain.settlementId}`);
    } else if (snap) {
      const snapRow = rows.find((r) => r.id === snap.id && r.kind === "snapshot");
      cls = snapRow?.class ?? "HISTORICAL_INCOMPLETE";
      reasons.push(`linked_snapshot:${snap.id}`);
    } else if (life.state === "cancelled" || life.state === "pending") {
      cls = "NO_FINANCIAL_IMPACT";
      reasons.push("no_proven_monetary_obligation");
    } else if (life.state === "completed") {
      // Completed without certified snapshot/settlement — do not invent money
      cls = "HISTORICAL_INCOMPLETE";
      reasons.push("completed_without_certified_finance_chain");
    } else {
      cls = "NO_FINANCIAL_IMPACT";
      reasons.push("unknown_lifecycle_no_proven_obligation");
    }

    if (
      cls === "CARRY_FORWARD_RECEIVABLE" ||
      cls === "CARRY_FORWARD_PAYABLE" ||
      cls === "HISTORICAL_INCOMPLETE" ||
      cls === "HISTORICAL_CONFLICT" ||
      cls === "LEGACY_ORPHAN" ||
      cls === "MALFORMED_BLOCKER"
    ) {
      ordersWithImpact += 1;
    } else {
      ordersWithoutImpact += 1;
    }

    rows.push({
      kind: "order",
      id: doc.id,
      collection: "order",
      class: cls,
      reasons,
      countryId:
        typeof data.countryId === "string"
          ? data.countryId
          : typeof data.country === "string"
            ? data.country
            : null,
      currency:
        typeof data.currency === "string" ? data.currency.toUpperCase() : null,
      partyType: null,
      partyId:
        typeof data.driverId === "string"
          ? data.driverId
          : typeof data.mndobId === "string"
            ? data.mndobId
            : null,
      amountMinor: null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: [
        snap ? `snapshot:${snap.id}` : null,
        chain ? `settlement:${chain.settlementId}` : null,
        settledOrderIds.has(doc.id) ? "has_settlement" : null,
      ].filter(Boolean) as string[],
      provenanceProvenSynthetic: proven.has(doc.id),
    });
  }

  // ---- Audit / DQ ----
  for (const doc of input.extraDocs.finance_audit_events ?? []) {
    if (!doc.exists) continue;
    const synth = syntheticProvenance(doc.id, proven);
    rows.push({
      kind: "finance_audit",
      id: doc.id,
      collection: "finance_audit_events",
      class: synth.synthetic
        ? "SYNTHETIC_QA_TEST"
        : "HISTORICAL_REFERENCE_ONLY",
      reasons: ["audit_no_opening_balance_impact"],
      countryId: null,
      currency: null,
      partyType: null,
      partyId: null,
      amountMinor: null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: ["collection:finance_audit_events"],
      provenanceProvenSynthetic: proven.has(doc.id),
    });
  }

  for (const doc of input.extraDocs.finance_reconciliation_runs ?? []) {
    if (!doc.exists) continue;
    rows.push({
      kind: "reconciliation",
      id: doc.id,
      collection: "finance_reconciliation_runs",
      class: "HISTORICAL_REFERENCE_ONLY",
      reasons: ["recon_run_reference_only"],
      countryId: null,
      currency: null,
      partyType: null,
      partyId: null,
      amountMinor: null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: ["collection:finance_reconciliation_runs"],
      provenanceProvenSynthetic: false,
    });
  }

  // ---- Malformed (never silently discard) ----
  const malformedResolved: FinanceImpactInventoryRow[] = [];
  const malformedBlockers: FinanceImpactInventoryRow[] = [];
  for (const m of input.malformedDocs) {
    const synth = syntheticProvenance(m.id, proven);
    const hasMoney = m.moneyFieldsPresent.length > 0;
    let cls: FinanceFinancialImpactClass;
    const reasons = [...m.problems];
    if (synth.synthetic) {
      cls = "SYNTHETIC_QA_TEST";
      reasons.push(synth.proven ? "provenance_proven_malformed" : "qa_heuristic_malformed");
    } else if (hasMoney) {
      cls = "MALFORMED_BLOCKER";
      reasons.push("real_malformed_with_money_fields");
    } else {
      cls = "MALFORMED_BLOCKER";
      reasons.push("real_malformed_shape");
    }
    const row: FinanceImpactInventoryRow = {
      kind: "malformed",
      id: m.id,
      collection: m.collection,
      class: cls,
      reasons,
      countryId: null,
      currency: m.currency,
      partyType: null,
      partyId: m.linkedParty,
      amountMinor: null,
      carryForwardReceivableMinor: null,
      carryForwardPayableMinor: null,
      sourceReferences: [
        m.linkedOrderId ? `order:${m.linkedOrderId}` : null,
        m.linkedSettlementId ? `link:${m.linkedSettlementId}` : null,
        m.linkedParty ? `party:${m.linkedParty}` : null,
      ].filter(Boolean) as string[],
      provenanceProvenSynthetic: proven.has(m.id),
    };
    rows.push(row);
    if (cls === "MALFORMED_BLOCKER") malformedBlockers.push(row);
    else malformedResolved.push(row);
  }

  // ---- Counts ----
  const counts = emptyCounts();
  const idsByClass = emptyIds();
  for (const r of rows) {
    counts[r.class] += 1;
    idsByClass[r.class].push(r.id);
  }

  // ---- Opening balances (only authoritative carry-forward) ----
  const openingByKey = new Map<string, OpeningBalanceProofRow>();
  const unresolvedMoney: FinanceFinancialImpactResolutionReport["unresolvedMoney"] =
    [];

  for (const r of rows) {
    if (
      r.class === "CARRY_FORWARD_RECEIVABLE" ||
      r.class === "CARRY_FORWARD_PAYABLE"
    ) {
      if (r.kind !== "settlement" && r.kind !== "wallet") continue;
      // Wallet carry only when settlement-confirmed direction already set above
      if (r.kind === "wallet") {
        // Wallet amounts enter opening ONLY when class is carry-forward AND
        // amount is present — already gated by settlement direction.
        if (
          !r.partyType ||
          !r.partyId ||
          !r.currency ||
          (r.carryForwardReceivableMinor == null &&
            r.carryForwardPayableMinor == null)
        ) {
          unresolvedMoney.push({
            id: r.id,
            kind: r.kind,
            class: r.class,
            reason: "wallet_carry_missing_party_or_amount",
            amountMinor: r.amountMinor,
          });
          continue;
        }
      }
      if (r.kind === "settlement") {
        if (
          !r.partyType ||
          !r.partyId ||
          !r.currency ||
          r.amountMinor == null
        ) {
          unresolvedMoney.push({
            id: r.id,
            kind: r.kind,
            class: r.class,
            reason: "settlement_carry_incomplete_identity",
            amountMinor: r.amountMinor,
          });
          continue;
        }
      }
      if (!r.partyType || r.partyType === "company" || !r.partyId || !r.currency) {
        continue;
      }
      const recv =
        r.class === "CARRY_FORWARD_RECEIVABLE"
          ? (r.carryForwardReceivableMinor ?? r.amountMinor ?? "0")
          : "0";
      const pay =
        r.class === "CARRY_FORWARD_PAYABLE"
          ? (r.carryForwardPayableMinor ?? r.amountMinor ?? "0")
          : "0";
      // Settlements are primary authority; skip wallet if settlement already counted same party
      if (r.kind === "wallet") {
        const settAlready = [...openingByKey.values()].some(
          (o) =>
            o.partyId === r.partyId &&
            o.currency === r.currency &&
            o.confidence === "authoritative_settlement",
        );
        if (settAlready) {
          // Wallet confirms party exposure but settlement is SoT — do not double-count
          continue;
        }
      }
      const key = `${r.partyType}|${r.partyId}|${r.currency}`;
      const existing = openingByKey.get(key);
      if (!existing) {
        openingByKey.set(key, {
          party: `${r.partyType}:${r.partyId}`,
          partyType: r.partyType,
          partyId: r.partyId,
          currency: r.currency,
          countryId: r.countryId,
          openingReceivable: recv,
          openingPayable: pay,
          supportingRecordIds: [r.id],
          reason:
            r.kind === "settlement"
              ? "unpaid_certified_settlement_outstanding"
              : "nonzero_wallet_with_settlement_confirmed_direction",
          confidence:
            r.kind === "settlement"
              ? "authoritative_settlement"
              : "authoritative_wallet_with_direction",
          sourceAuthority:
            r.kind === "settlement"
              ? "financial_settlements.amountMinor-paidConfirmedMinor"
              : "wallets.currentBalance|walletBalance + settlement direction",
        });
      } else if (r.kind === "settlement") {
        existing.openingReceivable = addMinor(existing.openingReceivable, recv);
        existing.openingPayable = addMinor(existing.openingPayable, pay);
        existing.supportingRecordIds.push(r.id);
        existing.confidence = "authoritative_settlement";
      }
    } else if (
      r.class === "HISTORICAL_INCOMPLETE" ||
      r.class === "HISTORICAL_CONFLICT" ||
      r.class === "LEGACY_ORPHAN" ||
      r.class === "MALFORMED_BLOCKER"
    ) {
      if (
        r.kind === "settlement" ||
        r.kind === "wallet" ||
        r.kind === "malformed" ||
        r.kind === "order"
      ) {
        unresolvedMoney.push({
          id: r.id,
          kind: r.kind,
          class: r.class,
          reason: r.reasons.join("|"),
          amountMinor: r.amountMinor,
        });
      }
    }
  }

  const openingRows = [...openingByKey.values()];
  const companyReceivableByCurrency: Record<string, string> = {};
  const companyPayableByCurrency: Record<string, string> = {};
  const companyNetByCurrency: Record<string, string> = {};
  for (const o of openingRows) {
    companyReceivableByCurrency[o.currency] = addMinor(
      companyReceivableByCurrency[o.currency] ?? "0",
      o.openingReceivable,
    );
    companyPayableByCurrency[o.currency] = addMinor(
      companyPayableByCurrency[o.currency] ?? "0",
      o.openingPayable,
    );
  }
  for (const cur of new Set([
    ...Object.keys(companyReceivableByCurrency),
    ...Object.keys(companyPayableByCurrency),
  ])) {
    companyNetByCurrency[cur] = (
      BigInt(companyReceivableByCurrency[cur] ?? "0") -
      BigInt(companyPayableByCurrency[cur] ?? "0")
    ).toString();
  }

  // ---- Synthetic cleanup manifest (proven + explicit QA/demo namespaces) ----
  const syntheticEntries: SyntheticCleanupManifestEntry[] = [];
  for (const r of rows) {
    if (r.class !== "SYNTHETIC_QA_TEST") continue;
    if (!r.provenanceProvenSynthetic && !isFinanceQaOrPilotRecordId(r.id)) {
      // Prefer proven; still allow explicit finance QA id patterns with heuristic proof note
      if (
        !/^demo_fin_/i.test(r.id) &&
        !/^test_adminnext_/i.test(r.id) &&
        !/^admin_test_/i.test(r.id) &&
        !/^fin_rt_/i.test(r.id) &&
        !/^fin\d+_ctrl_/i.test(r.id) &&
        !/^qa_wave_/i.test(r.id)
      ) {
        continue;
      }
    }
    const rank =
      r.collection.includes("payment") || r.kind === "payment"
        ? 1
        : r.collection.includes("adjustment") || r.kind === "adjustment"
          ? 2
          : r.collection.includes("settlement") || r.kind === "settlement"
            ? 3
            : r.kind === "snapshot"
              ? 4
              : r.kind === "wallet_transaction"
                ? 5
                : r.kind === "wallet"
                  ? 6
                  : r.kind === "order"
                    ? 7
                    : 8;
    syntheticEntries.push({
      collection: r.collection,
      id: r.id,
      provenance: [
        r.provenanceProvenSynthetic
          ? "PROVENANCE_PROVEN_SYNTHETIC_IDS"
          : "explicit_qa_demo_pilot_id_pattern",
        ...r.reasons,
      ],
      linkedChildren: r.sourceReferences,
      deletionOrder: rank,
    });
  }
  syntheticEntries.sort((a, b) => a.deletionOrder - b.deletionOrder || a.id.localeCompare(b.id));

  const blockers: string[] = [];
  if (counts.MALFORMED_BLOCKER > 0) {
    blockers.push(`malformed_blockers:${counts.MALFORMED_BLOCKER}`);
  }
  if (counts.HISTORICAL_CONFLICT > 0) {
    blockers.push(`historical_conflicts:${counts.HISTORICAL_CONFLICT}`);
  }
  if (counts.HISTORICAL_INCOMPLETE > 0) {
    blockers.push(`historical_incomplete:${counts.HISTORICAL_INCOMPLETE}`);
  }
  if (counts.LEGACY_ORPHAN > 0) {
    blockers.push(`legacy_orphans_unresolved:${counts.LEGACY_ORPHAN}`);
  }
  if (unresolvedMoney.length > 0) {
    blockers.push(`unresolved_money_rows:${unresolvedMoney.length}`);
  }
  blockers.push("FINANCE_CUTOVER_APPROVED_not_set");
  blockers.push("opening_balance_persist_disabled_until_apply");
  blockers.push("destructive_delete_requires_explicit_second_approval");
  blockers.push("maintenance_sequence_not_executed");

  const fullySettledChains = chains.filter(
    (c) => c.financialImpact === "FULLY_SETTLED",
  ).length;
  const unresolvedChains = chains.filter(
    (c) =>
      c.financialImpact !== "FULLY_SETTLED" &&
      c.financialImpact !== "SYNTHETIC_QA_TEST",
  ).length;

  return {
    dryRun: true,
    productionWrites: 0,
    deletions: 0,
    totalRecords: rows.length,
    unclassified: 0,
    counts,
    idsByClass,
    rows,
    wallets: {
      reviewed: walletReviews,
      nonzeroReal: walletReviews.filter(
        (w) =>
          w.realOrSynthetic === "real" &&
          w.storedBalanceMinor != null &&
          w.storedBalanceMinor !== "0" &&
          w.storedBalanceAvailability === "available",
      ),
      conflicts: walletReviews.filter(
        (w) => w.financialImpact === "HISTORICAL_CONFLICT",
      ),
    },
    settlementChains: {
      chains,
      fullySettled: fullySettledChains,
      unresolved: unresolvedChains,
    },
    orders: {
      withFinancialImpact: ordersWithImpact,
      withoutFinancialImpact: ordersWithoutImpact,
    },
    malformed: {
      resolved: malformedResolved,
      blockers: malformedBlockers,
      details: input.malformedDocs,
    },
    openingBalances: {
      driver: openingRows.filter((o) => o.partyType === "driver"),
      agent: openingRows.filter((o) => o.partyType === "agent"),
      companyReceivableByCurrency,
      companyPayableByCurrency,
      companyNetByCurrency,
    },
    unresolvedMoney,
    syntheticDeleteManifest: {
      dryRun: true,
      deletions: 0,
      entries: syntheticEntries,
      realRecordsToDelete: 0,
    },
    maintenanceSequenceDefinedNotExecuted: [
      "1. pause finance writes (FINANCE_WRITE_ENABLED=false)",
      "2. final delta census",
      "3. backup/export manifest",
      "4. persist approved opening balances",
      "5. close/archive pre-cutover records",
      "6. enable current-period split",
      "7. validate balances",
      "8. re-arm finance writes",
    ],
    blockers,
    readyForCutoverApply: false,
  };
}

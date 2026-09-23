/**
 * Production FR1 — materialize certified accounting snapshots for real orders.
 * Canonical calculator: calculateFinanceFr1PilotSnapshot + mapOrderToTripFinancialSnapshot.
 * Historical persisted majors always win. Never mutates order/. Never settlements.
 */

import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import type { FinanceFr1CalculatedSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import type { AccountingSnapshotMaterializePorts } from "@/application/finance/materialize/AccountingSnapshotMaterializePorts";
import {
  ACCOUNTING_SNAPSHOT_CLIENT_KEY_PREFIX,
  buildProductionAccountingSnapshotAuditIntentDoc,
  buildProductionAccountingSnapshotAuditResultDoc,
  buildProductionAccountingSnapshotDoc,
  buildProductionAccountingSnapshotIdempotencyDoc,
  sanitizeIdempotencyDocId,
} from "@/application/finance/materialize/AccountingSnapshotMaterializeDocuments";

export const ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_APPLY = 5 as const;
export const ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN = 50 as const;

export type MaterializeActor = {
  userId: string;
  role: string;
  permissions: FinancePermission[] | string[];
  countryIds?: string[] | null;
};

export type MaterializeTripSample = {
  orderId: string;
  grossFareMinor: string | null;
  platformCommissionMinor: string | null;
  vatAmountMinor: string | null;
  driverNetMinor: string | null;
  gatewayFeeMinor: string | null;
  gatewayFeeCurrency: string | null;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  countryId: string | null;
  sourceFields: {
    gross: "order.total_mndob2";
    platformCommission: "order.total_app";
    vat: "order.total_vat";
    driverNet: "order.total_mndob";
    customerTotal: "order.total";
  };
};

export type MaterializeTripResult = {
  orderId: string;
  status:
    | "eligible"
    | "already_materialized"
    | "skipped"
    | "missing_financial_facts"
    | "inconsistent"
    | "created"
    | "error";
  reasons: string[];
  sample?: MaterializeTripSample;
  snapshotId?: string | null;
  writes?: number;
};

export type MaterializeBatchResult = {
  dryRun: boolean;
  correlationId: string;
  eligibilityRule: string;
  scanned: number;
  eligible: MaterializeTripResult[];
  alreadyMaterialized: MaterializeTripResult[];
  skipped: MaterializeTripResult[];
  missingFinancialFacts: MaterializeTripResult[];
  inconsistent: MaterializeTripResult[];
  created: MaterializeTripResult[];
  errors: MaterializeTripResult[];
  samples: MaterializeTripSample[];
  productionWrites: number;
  orderMutations: 0;
  settlementWrites: 0;
};

function requirePrepare(actor: MaterializeActor): void {
  const perms = actor.permissions as string[];
  const ok =
    perms.includes("settlements:prepare") ||
    perms.includes("settlements:create") ||
    actor.role === "super_admin";
  if (!ok) throw new Error("rbac_denied:settlements:prepare");
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseMinor(s: string | null | undefined): bigint | null {
  if (s == null || s === "") return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * Fail-closed consistency: when all majors present, driverNet must equal
 * gross − commission − vat. Never auto-fix.
 */
export function detectMajorInconsistency(
  calculated: FinanceFr1CalculatedSnapshot,
): string[] {
  const gross = parseMinor(calculated.grossFareMinor);
  const commission = parseMinor(calculated.commissionAmountPersistedMinor);
  const vat = parseMinor(calculated.vatAmountMinor);
  const driverNet = parseMinor(calculated.driverNetMinor);
  if (gross == null || commission == null || vat == null || driverNet == null) {
    return [];
  }
  const expected = gross - commission - vat;
  if (expected !== driverNet) {
    return [
      `majors_inconsistent:expected_driverNet=${expected.toString()}_got=${driverNet.toString()}`,
    ];
  }
  return [];
}

function toSample(
  calculated: FinanceFr1CalculatedSnapshot,
  canonicalCountryId: string | null,
): MaterializeTripSample {
  return {
    orderId: calculated.orderId,
    grossFareMinor: calculated.grossFareMinor,
    platformCommissionMinor: calculated.commissionAmountPersistedMinor,
    vatAmountMinor: calculated.vatAmountMinor,
    driverNetMinor: calculated.driverNetMinor,
    gatewayFeeMinor: calculated.gatewayFeeMinor,
    gatewayFeeCurrency: calculated.gatewayFeeCurrency,
    paymentMethod: calculated.paymentMethod,
    paymentStatus: calculated.paymentStatus,
    currency: calculated.currency,
    countryId: canonicalCountryId,
    sourceFields: {
      gross: "order.total_mndob2",
      platformCommission: "order.total_app",
      vat: "order.total_vat",
      driverNet: "order.total_mndob",
      customerTotal: "order.total",
    },
  };
}

function missingFactReasons(calculated: FinanceFr1CalculatedSnapshot): string[] {
  return calculated.reconciliationBlockers.filter((b) =>
    /missing|unknown|currency_missing|gross_fare|driver_net|platform_commission|vat_|payment_channel|snapshot_/.test(
      b,
    ),
  );
}

export class AccountingSnapshotMaterializeService {
  constructor(
    private readonly ports: AccountingSnapshotMaterializePorts,
    private readonly gate: FinanceWriteGate,
  ) {}

  async run(input: {
    actor: MaterializeActor;
    dryRun: boolean;
    orderIds?: string[];
    scanLimit?: number;
    applyLimit?: number;
    clientKey: string;
    correlationId: string;
    includeQaFixtures?: boolean;
  }): Promise<MaterializeBatchResult> {
    requirePrepare(input.actor);

    const dryRun = input.dryRun !== false;
    if (!dryRun) {
      this.gate.requireWritable("snapshot.materialize");
    }

    const applyLimit = Math.min(
      Math.max(1, input.applyLimit ?? ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_APPLY),
      ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_APPLY,
    );
    const scanLimit = Math.min(
      Math.max(1, input.scanLimit ?? ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN),
      ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN,
    );

    const result: MaterializeBatchResult = {
      dryRun,
      correlationId: input.correlationId,
      eligibilityRule:
        "evaluateCertifiedAccountingSnapshotEligibility: lifecycleCompleted ∧ paymentChannel∈{cash,card} ∧ paymentStatus∈{paid,cash_collected,captured}; majors from order.total_mndob2/total_app/total_vat/total_mndob; historical persisted commission wins; missing≠0",
      scanned: 0,
      eligible: [],
      alreadyMaterialized: [],
      skipped: [],
      missingFinancialFacts: [],
      inconsistent: [],
      created: [],
      errors: [],
      samples: [],
      productionWrites: 0,
      orderMutations: 0,
      settlementWrites: 0,
    };

    let candidates: Array<{ id: string; data: Record<string, unknown> }> = [];

    if (input.orderIds?.length) {
      const ids = input.orderIds.slice(0, scanLimit);
      for (const id of ids) {
        const doc = await this.ports.read.getOrder(id);
        if (!doc.exists || !doc.data) {
          result.skipped.push({
            orderId: id,
            status: "skipped",
            reasons: ["order_not_found"],
          });
          continue;
        }
        candidates.push({ id: doc.id, data: doc.data });
      }
    } else {
      candidates = await this.ports.read.listRecentOrders({ limit: scanLimit });
    }

    result.scanned = candidates.length;

    const eligibleQueue: Array<{
      orderId: string;
      calculated: FinanceFr1CalculatedSnapshot;
      canonicalCountryId: string;
      sample: MaterializeTripSample;
    }> = [];

    for (const order of candidates) {
      if (
        !input.includeQaFixtures &&
        isFinanceQaOrPilotRecordId(order.id)
      ) {
        result.skipped.push({
          orderId: order.id,
          status: "skipped",
          reasons: ["qa_or_pilot_fixture_excluded"],
        });
        continue;
      }

      const classification = classifyFinanceFr1Trip({
        documentId: order.id,
        data: order.data,
      });
      if (classification === "synthetic_test" && !input.includeQaFixtures) {
        result.skipped.push({
          orderId: order.id,
          status: "skipped",
          reasons: ["synthetic_test_excluded"],
        });
        continue;
      }

      const calculated = calculateFinanceFr1PilotSnapshot({
        order: { documentId: order.id, data: order.data },
        actorUserId: input.actor.userId,
      });

      const countryRaw = calculated.countryId;
      const canonicalCountryId = tryCanonicalCountryId(countryRaw);
      const sample = toSample(calculated, canonicalCountryId);

      const existing = await this.ports.read.getSnapshot(order.id);
      if (existing.exists) {
        result.alreadyMaterialized.push({
          orderId: order.id,
          status: "already_materialized",
          reasons: ["snapshot_already_exists"],
          sample,
          snapshotId: order.id,
        });
        continue;
      }

      if (!canonicalCountryId) {
        result.skipped.push({
          orderId: order.id,
          status: "skipped",
          reasons: [
            `country_unmapped:${countryRaw ?? "null"}`,
            "fr7_requires_canonical_countryId",
          ],
          sample,
        });
        continue;
      }

      if (
        input.actor.countryIds &&
        input.actor.countryIds.length > 0 &&
        !input.actor.countryIds.includes(canonicalCountryId)
      ) {
        result.skipped.push({
          orderId: order.id,
          status: "skipped",
          reasons: [`cross_country_denied:${canonicalCountryId}`],
          sample,
        });
        continue;
      }

      const inconsistent = detectMajorInconsistency(calculated);
      if (inconsistent.length > 0) {
        result.inconsistent.push({
          orderId: order.id,
          status: "inconsistent",
          reasons: inconsistent,
          sample,
        });
        continue;
      }

      if (calculated.reconciliationStatus === "preconditions_blocked") {
        const missing = missingFactReasons(calculated);
        const eligibilityOnly = calculated.reconciliationBlockers.filter((b) =>
          b.startsWith("snapshot_"),
        );
        const other = calculated.reconciliationBlockers.filter(
          (b) => !missing.includes(b) && !eligibilityOnly.includes(b),
        );

        if (missing.length > 0) {
          result.missingFinancialFacts.push({
            orderId: order.id,
            status: "missing_financial_facts",
            reasons: calculated.reconciliationBlockers,
            sample,
          });
        } else if (eligibilityOnly.length > 0) {
          result.skipped.push({
            orderId: order.id,
            status: "skipped",
            reasons: calculated.reconciliationBlockers,
            sample,
          });
        } else {
          result.skipped.push({
            orderId: order.id,
            status: "skipped",
            reasons:
              other.length > 0
                ? calculated.reconciliationBlockers
                : ["preconditions_blocked"],
            sample,
          });
        }
        continue;
      }

      const eligibleRow: MaterializeTripResult = {
        orderId: order.id,
        status: "eligible",
        reasons: ["preconditions_ok", calculated.snapshotEligibilityTrigger],
        sample,
      };
      result.eligible.push(eligibleRow);
      if (result.samples.length < 5) {
        result.samples.push(sample);
      }
      eligibleQueue.push({
        orderId: order.id,
        calculated,
        canonicalCountryId,
        sample,
      });
    }

    if (dryRun) {
      return result;
    }

    let applied = 0;
    for (const item of eligibleQueue) {
      if (applied >= applyLimit) break;

      const clientKey =
        input.clientKey?.trim() ||
        `${ACCOUNTING_SNAPSHOT_CLIENT_KEY_PREFIX}:${item.orderId}`;
      const idempotencyKey = buildFinanceIdempotencyKey({
        actorUid: input.actor.userId,
        op: "snapshot.materialize",
        resourceType: "order",
        resourceId: item.orderId,
        clientKey,
      });
      const idemDocId = sanitizeIdempotencyDocId(idempotencyKey);

      const existingIdem = await this.ports.read.getIdempotency(idemDocId);
      const existingSnap = await this.ports.read.getSnapshot(item.orderId);
      if (existingSnap.exists || existingIdem.exists) {
        result.alreadyMaterialized.push({
          orderId: item.orderId,
          status: "already_materialized",
          reasons: ["idempotent_already_applied"],
          sample: item.sample,
          snapshotId: item.orderId,
          writes: 0,
        });
        // Remove from eligible display for clarity
        result.eligible = result.eligible.filter(
          (e) => e.orderId !== item.orderId,
        );
        continue;
      }

      const atUtc = new Date().toISOString();
      const auditIntentId = generateId("fr1_mat_intent");
      const auditResultId = generateId("fr1_mat_result");

      try {
        const intent = await this.ports.write.createAudit(
          auditIntentId,
          buildProductionAccountingSnapshotAuditIntentDoc({
            id: auditIntentId,
            orderId: item.orderId,
            actorUid: input.actor.userId,
            correlationId: input.correlationId,
            idempotencyKey,
            atUtc,
          }),
        );
        if (!intent.ok) {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: [`audit_intent_${intent.code}:${intent.message}`],
            sample: item.sample,
          });
          break; // stop batch on write failure
        }
        result.productionWrites += 1;

        const snapDoc = buildProductionAccountingSnapshotDoc({
          calculated: item.calculated,
          canonicalCountryId: item.canonicalCountryId,
          actorUid: input.actor.userId,
          correlationId: input.correlationId,
          idempotencyKey,
          createdAtUtc: atUtc,
        });
        const snapCreate = await this.ports.write.createSnapshot(
          item.orderId,
          snapDoc,
        );
        if (!snapCreate.ok) {
          if (snapCreate.code === "ALREADY_EXISTS") {
            result.alreadyMaterialized.push({
              orderId: item.orderId,
              status: "already_materialized",
              reasons: ["snapshot_create_already_exists"],
              sample: item.sample,
              snapshotId: item.orderId,
              writes: 1,
            });
            result.eligible = result.eligible.filter(
              (e) => e.orderId !== item.orderId,
            );
            continue;
          }
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: [`snapshot_${snapCreate.code}:${snapCreate.message}`],
            sample: item.sample,
          });
          break;
        }
        result.productionWrites += 1;

        const idemCreate = await this.ports.write.createIdempotency(
          idemDocId,
          buildProductionAccountingSnapshotIdempotencyDoc({
            key: idemDocId,
            orderId: item.orderId,
            snapshotId: item.orderId,
            actorUid: input.actor.userId,
            correlationId: input.correlationId,
            auditIntentId,
            auditResultId,
            createdAtUtc: atUtc,
            clientKey,
          }),
        );
        if (!idemCreate.ok && idemCreate.code !== "ALREADY_EXISTS") {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: [`idempotency_${idemCreate.code}:${idemCreate.message}`],
            sample: item.sample,
            snapshotId: item.orderId,
          });
          break;
        }
        if (idemCreate.ok) result.productionWrites += 1;

        const resultAudit = await this.ports.write.createAudit(
          auditResultId,
          buildProductionAccountingSnapshotAuditResultDoc({
            id: auditResultId,
            snapshotId: item.orderId,
            actorUid: input.actor.userId,
            correlationId: input.correlationId,
            idempotencyKey,
            atUtc: new Date().toISOString(),
            outcome: "applied",
          }),
        );
        if (!resultAudit.ok && resultAudit.code !== "ALREADY_EXISTS") {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: [
              `audit_result_${resultAudit.code}:${resultAudit.message}`,
            ],
            sample: item.sample,
            snapshotId: item.orderId,
          });
          break;
        }
        if (resultAudit.ok) result.productionWrites += 1;

        // Post-verify: order unchanged existence; snapshot present
        const orderAfter = await this.ports.read.getOrder(item.orderId);
        if (!orderAfter.exists) {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: ["post_verify_order_missing"],
            sample: item.sample,
            snapshotId: item.orderId,
          });
          break;
        }
        const snapAfter = await this.ports.read.getSnapshot(item.orderId);
        if (!snapAfter.exists) {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: ["post_verify_snapshot_missing"],
            sample: item.sample,
          });
          break;
        }
        // Majors preserved on snapshot
        if (
          String(snapAfter.data?.commissionAmountPersistedMinor ?? "") !==
            String(item.calculated.commissionAmountPersistedMinor ?? "") ||
          String(snapAfter.data?.grossFareMinor ?? "") !==
            String(item.calculated.grossFareMinor ?? "") ||
          snapAfter.data?.mutatesOrderMajors !== false ||
          snapAfter.data?.historicalReRateForbidden !== true
        ) {
          result.errors.push({
            orderId: item.orderId,
            status: "error",
            reasons: ["post_verify_majors_mismatch"],
            sample: item.sample,
            snapshotId: item.orderId,
          });
          break;
        }

        result.created.push({
          orderId: item.orderId,
          status: "created",
          reasons: ["snapshot_materialized"],
          sample: item.sample,
          snapshotId: item.orderId,
          writes: 4,
        });
        result.eligible = result.eligible.filter(
          (e) => e.orderId !== item.orderId,
        );
        applied += 1;
      } catch (err) {
        result.errors.push({
          orderId: item.orderId,
          status: "error",
          reasons: [
            err instanceof Error ? err.message : "materialize_failed",
          ],
          sample: item.sample,
        });
        break;
      }
    }

    return result;
  }
}

/**
 * POST /api/finance/cutover/inventory-dry-run
 * Full paginated Production census + classification + opening-balance proposal.
 * Never writes, never deletes. STOP after dry-run report.
 */

import { NextResponse } from "next/server";
import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getEnv } from "@/config/env";
import { createFirebaseFinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { loadFinanceCutoverCensus } from "@/application/finance/cutover/FinanceCutoverCensusLoader";
import { runFinanceCutoverInventoryDryRun } from "@/application/finance/cutover/FinanceCutoverInventoryDryRun";
import { buildQaDeleteManifest } from "@/application/finance/cutover/FinanceQaDeleteManifest";
import { resolveFinanceFinancialImpact } from "@/application/finance/cutover/FinanceFinancialImpactResolution";
import { resolveFinanceCutoverDate } from "@/domain/finance/cutover/FinanceCutoverConfig";
import {
  FINANCE_OPENING_BALANCE_PERSIST_ENABLED,
  validateOpeningBalanceRecord,
  buildOpeningBalanceIdempotencyKey,
} from "@/domain/finance/cutover/FinanceOpeningBalanceRecord";

export const maxDuration = 300;

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");

    const body = (await request.json().catch(() => ({}))) as {
      cutoverDate?: string;
      timezone?: string;
      maxPagesPerCollection?: number;
      includeExtraCollections?: boolean;
      fullCensus?: boolean;
    };

    const env = getEnv();
    const writeArmed = Boolean(env.FINANCE_WRITE_ENABLED);
    // Census is read-only. Allow inventory even if write flags are armed in the
    // deployment env — but never mutate, and surface writeArmed as a hard apply blocker.
    if (writeArmed) {
      // continue — loadFinanceCutoverCensus asserts productionWrites === 0
    }

    if (
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      env.FINANCE_REPORTING_SOURCE_MODE !== "production_read_only"
    ) {
      return NextResponse.json(
        {
          error: "Production read required for cutover inventory dry-run",
          code: "SOURCE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    const cutover = resolveFinanceCutoverDate({
      cutoverDate:
        body.cutoverDate?.trim() ||
        env.FINANCE_CUTOVER_DATE.trim() ||
        "2026-10-01",
      timezone: body.timezone?.trim() || "Asia/Riyadh",
      approved: env.FINANCE_CUTOVER_APPROVED,
    });

    const firestore = await createFirebaseFinanceReportingRoFirestorePort();
    const fullCensus = body.fullCensus !== false;
    const census = await loadFinanceCutoverCensus({
      firestore,
      maxPagesPerCollection: body.maxPagesPerCollection,
      includeExtraCollections: body.includeExtraCollections !== false,
    });

    if (census.productionWrites !== 0 || census.firestoreMutations !== 0) {
      return NextResponse.json(
        {
          error: "Unexpected writes during dry-run load",
          code: "SAFETY_VIOLATION",
          productionWrites: census.productionWrites,
        },
        { status: 500 },
      );
    }

    const report = runFinanceCutoverInventoryDryRun({
      bundle: census.bundle,
      cutoverDate: cutover.businessDate,
      timezone: cutover.cutoverTimezone,
      approved: cutover.approved,
      boundedWindow: !fullCensus || !census.scanComplete,
      scannedByCollection: census.scannedByCollection,
      censusScanComplete: census.scanComplete,
      censusBlockers: census.blockers,
      extraDocs: census.extraDocs,
    });

    const qaManifest = buildQaDeleteManifest({
      rows: report.historicalRows,
      extraDocs: census.extraDocs,
    });

    const financialImpact = resolveFinanceFinancialImpact({
      bundle: census.bundle,
      extraDocs: census.extraDocs,
      malformedDocs: census.malformedDocs,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
    });

    const openingBalanceWireCheck = report.openingBalances.proposals.map(
      (p) => {
        const idempotencyKey = buildOpeningBalanceIdempotencyKey({
          partyType: p.partyType,
          partyId: p.partyId,
          countryId: p.country,
          currency: p.currency,
          cutoverBusinessDate: cutover.businessDate,
        });
        const candidate = {
          id: idempotencyKey,
          partyType: p.partyType,
          partyId: p.partyId,
          countryId: p.country,
          currency: p.currency,
          openingReceivableMinor: p.openingReceivable,
          openingPayableMinor: p.openingPayable,
          cutoverBusinessDate: cutover.businessDate,
          cutoverTimezone: "Asia/Riyadh" as const,
          cutoverUtcInstant: cutover.cutoverUtcInstant,
          sourceReferences: p.sourceReferences,
          createdBy: "dry_run",
          createdAtUtc: new Date().toISOString(),
          auditEventId: null,
          idempotencyKey,
          schemaVersion: 1 as const,
          status: "proposed" as const,
        };
        return {
          proposal: p,
          validation: validateOpeningBalanceRecord(candidate),
          persistEnabled: FINANCE_OPENING_BALANCE_PERSIST_ENABLED,
        };
      },
    );

    return jsonWithIds(
      {
        ...report,
        census: {
          productionReads: census.productionReads,
          scanComplete: census.scanComplete,
          scans: census.scans.map((s) => ({
            collection: s.collection,
            pages: s.pages,
            docs: s.docs,
            scanComplete: s.scanComplete,
            truncatedByPageCap: s.truncatedByPageCap,
            idSample: s.ids.slice(0, 50),
            idCount: s.ids.length,
          })),
          scannedByCollection: census.scannedByCollection,
        },
        qaDeleteManifest: qaManifest,
        financialImpact: {
          ...financialImpact,
          // Compact wallet reviews for transport; full wallet detail retained.
          walletSummary: {
            reviewed: financialImpact.wallets.reviewed.length,
            nonzeroReal: financialImpact.wallets.nonzeroReal.length,
            conflicts: financialImpact.wallets.conflicts.length,
          },
        },
        openingBalanceWireCheck,
        financeWriteEnabled: writeArmed,
        financeCutoverApproved: Boolean(env.FINANCE_CUTOVER_APPROVED),
        unexpectedMutations: census.productionWrites !== 0 || census.firestoreMutations !== 0,
        readyForCutoverApply: false,
        safety: {
          ...report.safety,
          blockers: [
            ...report.safety.blockers,
            ...financialImpact.blockers.filter(
              (b) => !report.safety.blockers.includes(b),
            ),
            ...(writeArmed
              ? ["FINANCE_WRITE_ENABLED_true_on_deployment_disarm_before_apply"]
              : []),
          ],
        },
      },
      ctx,
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(err) },
      { status: 500 },
    );
  }
}

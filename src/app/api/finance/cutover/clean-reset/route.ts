/**
 * POST /api/finance/cutover/clean-reset
 * Finance-only clean reset. Never mutates operational entities.
 *
 * body.mode = "dry_run" | "apply"
 * apply requires FINANCE_WRITE_ENABLED + operator confirmation string.
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
import { resolveFinanceFinancialImpact } from "@/application/finance/cutover/FinanceFinancialImpactResolution";
import { buildFinanceCleanResetManifest } from "@/application/finance/cutover/FinanceCleanResetManifest";
import { applyFinanceCleanReset } from "@/application/finance/cutover/FinanceCleanResetApply";
import { FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION } from "@/domain/finance/cutover/FinanceCleanResetScope";
import { resolveFinanceCutoverDate } from "@/domain/finance/cutover/FinanceCutoverConfig";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export const maxDuration = 300;

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");

    const body = (await request.json().catch(() => ({}))) as {
      mode?: "dry_run" | "apply";
      operatorConfirmation?: string;
      confirmProtectedZero?: boolean;
      cutoverDate?: string;
      timezone?: string;
    };

    const mode = body.mode === "apply" ? "apply" : "dry_run";
    const env = getEnv();
    const cutover = resolveFinanceCutoverDate({
      cutoverDate: body.cutoverDate?.trim() || "2026-10-01",
      timezone: body.timezone?.trim() || "Asia/Riyadh",
      approved: env.FINANCE_CUTOVER_APPROVED,
    });

    const firestore = await createFirebaseFinanceReportingRoFirestorePort();
    const census = await loadFinanceCutoverCensus({
      firestore,
      includeExtraCollections: true,
    });

    if (census.productionWrites !== 0 || census.firestoreMutations !== 0) {
      return NextResponse.json(
        { error: "Unexpected writes during census load", code: "SAFETY_VIOLATION" },
        { status: 500 },
      );
    }

    const impact = resolveFinanceFinancialImpact({
      bundle: census.bundle,
      extraDocs: census.extraDocs,
      malformedDocs: census.malformedDocs,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
    });

    const idsByCollection: Record<string, string[]> = {};
    for (const scan of census.scans) {
      idsByCollection[scan.collection] = scan.ids;
    }

    const manifest = buildFinanceCleanResetManifest({
      scannedByCollection: census.scannedByCollection,
      idsByCollection,
      impactRows: impact.rows,
      wallets: impact.wallets.reviewed,
      malformed: census.malformedDocs,
    });

    if (mode === "dry_run") {
      return jsonWithIds(
        {
          mode: "dry_run",
          dryRun: true,
          productionWrites: 0,
          financeWriteEnabled: Boolean(env.FINANCE_WRITE_ENABLED),
          financeCutoverApproved: Boolean(env.FINANCE_CUTOVER_APPROVED),
          cutover,
          census: {
            scanComplete: census.scanComplete,
            scannedByCollection: census.scannedByCollection,
            productionReads: census.productionReads,
          },
          manifest,
          protectedEntityAssertion: manifest.protectedEntityAssertion,
          readyForApply: manifest.readyForApply,
        },
        ctx,
      );
    }

    // APPLY path
    await requirePermission(ctx, "finance:adjust");
    if (!env.FINANCE_WRITE_ENABLED) {
      return NextResponse.json(
        {
          error: "FINANCE_WRITE_ENABLED must be true to apply clean reset",
          code: "WRITE_GATE_CLOSED",
        },
        { status: 409 },
      );
    }
    if (!env.GLOBAL_PRODUCTION_WRITE_ENABLED || !env.PRODUCTION_WRITE_ENABLED) {
      return NextResponse.json(
        {
          error: "Global/production write gates must be armed for clean reset apply",
          code: "WRITE_GATE_CLOSED",
        },
        { status: 409 },
      );
    }
    if (body.operatorConfirmation !== FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION) {
      return NextResponse.json(
        {
          error: "Operator confirmation string mismatch",
          code: "OPERATOR_CONFIRMATION_REQUIRED",
          expected: FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
        },
        { status: 400 },
      );
    }
    if (body.confirmProtectedZero !== true) {
      return NextResponse.json(
        {
          error: "confirmProtectedZero must be true",
          code: "PROTECTED_ASSERTION_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (!manifest.readyForApply) {
      return NextResponse.json(
        {
          error: "Manifest not ready — STOP",
          code: "MANIFEST_BLOCKED",
          blockers: manifest.blockers,
          protectedEntityAssertion: manifest.protectedEntityAssertion,
        },
        { status: 409 },
      );
    }

    const port = createWifWritePortOrThrow("finance_writer");
    const applyResult = await applyFinanceCleanReset({
      port,
      manifest,
      operatorConfirmation: body.operatorConfirmation,
      actorEmail: ctx.user.email ?? ctx.user.id,
    });

    return jsonWithIds(
      {
        mode: "apply",
        dryRun: false,
        cutover,
        manifestSummary: {
          counts: manifest.counts,
          protectedEntityAssertion: manifest.protectedEntityAssertion,
          entryCount: manifest.entries.length,
        },
        apply: applyResult,
        financeWriteEnabled: true,
        financeCutoverApproved: Boolean(env.FINANCE_CUTOVER_APPROVED),
        readyForCutoverApprove: applyResult.blockers.length === 0,
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

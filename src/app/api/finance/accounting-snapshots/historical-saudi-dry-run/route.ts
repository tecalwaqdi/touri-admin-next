/**
 * POST /api/finance/accounting-snapshots/historical-saudi-dry-run
 * Paginated Production order scan for Saudi historical integration.
 * Always dry-run — never writes snapshots, orders, or settlements.
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
import {
  createWifAccountingSnapshotMaterializePorts,
} from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import {
  HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
  HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
  runHistoricalSaudiTripsDryRun,
  type HistoricalSaudiScanPort,
} from "@/application/finance/materialize/HistoricalSaudiTripsDryRun";

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    await requirePermission(ctx, "trips:read");

    const body = (await request.json().catch(() => ({}))) as {
      maxPages?: number;
      pageSize?: number;
      cursor?: string | null;
    };

    const env = getEnv();
    if (
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled"
    ) {
      return NextResponse.json(
        {
          error: "Production read required for historical Saudi dry-run",
          code: "SOURCE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    const ports = await createWifAccountingSnapshotMaterializePorts();
    const read = ports.read;
    if (typeof read.listOrdersPage !== "function") {
      return NextResponse.json(
        { error: "listOrdersPage unavailable", code: "SOURCE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const scanPort: HistoricalSaudiScanPort = {
      listOrdersPage: (input) => read.listOrdersPage!(input),
      getSnapshotExists: async (orderId) => {
        const snap = await read.getSnapshot(orderId);
        return snap.exists;
      },
    };

    const result = await runHistoricalSaudiTripsDryRun({
      port: scanPort,
      maxPages: body.maxPages,
      pageSize: body.pageSize,
      startCursor: body.cursor ?? null,
    });

    return jsonWithIds(
      {
        ...result,
        limits: {
          maxPages: HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
          pageSize: HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
        },
        readyToApplyHint:
          result.counts.financiallyEligible > 0
            ? "YES_PENDING_OPERATOR_REVIEW"
            : "NO_NO_ELIGIBLE_ROWS",
      },
      ctx,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}

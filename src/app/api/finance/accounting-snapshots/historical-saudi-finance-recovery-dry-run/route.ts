/**
 * POST /api/finance/accounting-snapshots/historical-saudi-finance-recovery-dry-run
 * Inspect blocked historical Saudi trips for recoverable majors from
 * authoritative sources. Always dry-run — never writes.
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
import { createWifAccountingSnapshotMaterializePorts } from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import {
  runHistoricalSaudiFinanceRecoveryDryRun,
  type FinanceRecoveryScanPort,
} from "@/application/finance/materialize/HistoricalSaudiFinanceRecoveryDryRun";
import {
  HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
  HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
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
    };

    const env = getEnv();
    if (
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled"
    ) {
      return NextResponse.json(
        {
          error: "Production read required for finance recovery dry-run",
          code: "SOURCE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    const ports = await createWifAccountingSnapshotMaterializePorts();
    const read = ports.read as typeof ports.read & {
      listOrdersPage?: FinanceRecoveryScanPort["listOrdersPage"];
      queryFinanceEqual?: FinanceRecoveryScanPort["queryFinanceEqual"];
      queryRoEqual?: FinanceRecoveryScanPort["queryRoEqual"];
    };
    if (typeof read.listOrdersPage !== "function") {
      return NextResponse.json(
        { error: "listOrdersPage unavailable", code: "SOURCE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const scanPort: FinanceRecoveryScanPort = {
      listOrdersPage: (input) => read.listOrdersPage!(input),
      getSnapshot: async (orderId) => {
        const snap = await read.getSnapshot(orderId);
        return { exists: snap.exists, data: snap.data };
      },
      queryFinanceEqual: read.queryFinanceEqual
        ? (collection, field, value, limit) =>
            read.queryFinanceEqual!(collection, field, value, limit)
        : undefined,
      queryRoEqual: read.queryRoEqual
        ? (collection, field, value, limit) =>
            read.queryRoEqual!(collection, field, value, limit)
        : undefined,
    };

    const result = await runHistoricalSaudiFinanceRecoveryDryRun({
      port: scanPort,
      maxPages: body.maxPages,
      pageSize: body.pageSize,
    });

    return jsonWithIds(
      {
        ...result,
        limits: {
          maxPages: HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
          pageSize: HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
        },
        readyToApplyHint: "NO_DRY_RUN_ONLY",
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

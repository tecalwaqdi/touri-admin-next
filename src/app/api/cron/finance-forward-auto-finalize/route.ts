/**
 * GET/POST /api/cron/finance-forward-auto-finalize
 *
 * Vercel Cron + optional CRON_SECRET bearer.
 * In-process FinanceForwardReconcileService → FinanceForwardAutoSnapshotService.
 * Never client-initiated for production apply (cron / S2S only).
 */

import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { createIdempotencyKey } from "@/lib/ids";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import {
  createFakeAccountingSnapshotMaterializePorts,
  createWifAccountingSnapshotMaterializePorts,
} from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import { FinanceForwardReconcileService } from "@/application/finance/materialize/FinanceForwardReconcileService";
import { permissionsForRole } from "@/permissions/rbac";

function assertCronAuthorized(request: Request): void {
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "1") return;

  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth === `Bearer ${secret}`) return;
  }

  // Fail closed when neither Vercel cron header nor valid CRON_SECRET.
  const err = new Error("cron_unauthorized");
  (err as Error & { status: number }).status = 401;
  throw err;
}

async function run(request: Request): Promise<Response> {
  try {
    assertCronAuthorized(request);
  } catch {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    let dryRun = url.searchParams.get("dryRun") !== "false";
    let scanLimit = Number(url.searchParams.get("scanLimit") || "25");
    let includeQaFixtures = url.searchParams.get("includeQaFixtures") === "true";

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        dryRun?: boolean;
        scanLimit?: number;
        includeQaFixtures?: boolean;
      };
      if (body.dryRun === false) dryRun = false;
      if (typeof body.scanLimit === "number") scanLimit = body.scanLimit;
      if (body.includeQaFixtures === true) includeQaFixtures = true;
    }

    // Production cron defaults to apply (dryRun false) unless explicitly dry.
    if (
      request.headers.get("x-vercel-cron") === "1" &&
      url.searchParams.get("dryRun") == null
    ) {
      dryRun = false;
    }

    const env = getEnv();
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled";

    const gate = allowOffline
      ? createOfflineFakeFinanceWriteGate()
      : createProductionFinanceWriteGate({
          FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
          GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
          PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        });

    const ports = allowOffline
      ? createFakeAccountingSnapshotMaterializePorts()
      : await createWifAccountingSnapshotMaterializePorts();

    const service = new FinanceForwardReconcileService(ports, gate);
    const actorPerms = permissionsForRole("super_admin");
    const result = await service.reconcile({
      actor: {
        userId: "cron:finance_forward_auto_finalize",
        role: "super_admin",
        permissions: actorPerms,
        countryIds: null,
      },
      dryRun,
      correlationId: createIdempotencyKey("fr_recon"),
      scanLimit,
      includeQaFixtures,
    });

    return NextResponse.json({
      ...result,
      path: "finance_forward_reconcile_cron",
      FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
      productionWriteExecuted: !dryRun && result.created > 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

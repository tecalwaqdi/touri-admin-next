/**
 * POST /api/finance/accounting-snapshots/auto-finalize
 *
 * Forward path: when a trip is completed + financially final, create the
 * certified accounting snapshot via FR1 materializer (idempotent).
 * On major inconsistency: DQ audit only — no snapshot, no order mutation.
 *
 * Admin batch /api/.../materialize remains the controlled recovery tool.
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
import { createIdempotencyKey } from "@/lib/ids";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import {
  createFakeAccountingSnapshotMaterializePorts,
  createWifAccountingSnapshotMaterializePorts,
} from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import { FinanceForwardAutoSnapshotService } from "@/application/finance/materialize/FinanceForwardAutoSnapshotService";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "settlements:prepare");

    const body = (await request.json().catch(() => ({}))) as {
      orderId?: string;
      dryRun?: boolean;
      clientKey?: string;
      correlationId?: string;
      includeQaFixtures?: boolean;
    };

    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const dryRun = body.dryRun !== false;
    const env = getEnv();
    const correlationId =
      (typeof body.correlationId === "string" && body.correlationId.trim()) ||
      createIdempotencyKey("fr_auto");
    const clientKey =
      typeof body.clientKey === "string" && body.clientKey.trim()
        ? body.clientKey.trim()
        : undefined;

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

    const service = new FinanceForwardAutoSnapshotService(ports, gate);
    const countryIds =
      ctx.user.scope.type === "country"
        ? ctx.user.scope.countryIds ?? []
        : ctx.user.scope.type === "global"
          ? null
          : ctx.user.scope.countryIds ?? [];

    const result = await service.finalizeOrder({
      actor: {
        userId: ctx.user.id,
        role: ctx.user.role,
        permissions: ctx.user.permissions as FinancePermission[],
        countryIds,
      },
      orderId,
      dryRun,
      correlationId,
      clientKey,
      includeQaFixtures: body.includeQaFixtures === true,
    });

    return jsonWithIds(
      {
        ...result,
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
        productionWriteExecuted: !dryRun && result.productionWrites > 0,
        path: "finance_forward_auto_snapshot",
        adminMaterializeRemainsRecoveryTool: true,
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
    const message = error instanceof Error ? error.message : "error";
    if (message.startsWith("rbac_denied:")) {
      return NextResponse.json(
        { error: message, code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (message.startsWith("production_finance_write_denied:")) {
      return NextResponse.json(
        { error: message, code: "WRITE_GATE_DENIED" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}

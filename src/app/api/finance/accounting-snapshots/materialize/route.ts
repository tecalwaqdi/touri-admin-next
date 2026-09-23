/**
 * POST /api/finance/accounting-snapshots/materialize
 *
 * Controlled FR1 materialization for eligible real Production orders.
 * - dryRun=true (default): classify only, zero writes
 * - dryRun=false: create-only snapshots (max 5), audit + idempotency
 * Never mutates order/. Never settlements.
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
  createProductionFinanceWriteGate,
  createOfflineFakeFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import {
  ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_APPLY,
  ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN,
  AccountingSnapshotMaterializeService,
} from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import {
  createFakeAccountingSnapshotMaterializePorts,
  createWifAccountingSnapshotMaterializePorts,
} from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    // Explicit finance prepare permission (super_admin has all).
    await requirePermission(ctx, "settlements:prepare");

    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean;
      orderIds?: string[];
      scanLimit?: number;
      applyLimit?: number;
      clientKey?: string;
      correlationId?: string;
      includeQaFixtures?: boolean;
    };

    const dryRun = body.dryRun !== false;
    const env = getEnv();
    const correlationId =
      (typeof body.correlationId === "string" && body.correlationId.trim()) ||
      createIdempotencyKey("fr1_mat");
    const clientKey =
      (typeof body.clientKey === "string" && body.clientKey.trim()) ||
      createIdempotencyKey("admin_fr1_materialize_v1");

    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim())
          .slice(0, ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN)
      : undefined;

    if (
      orderIds?.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    ) {
      return NextResponse.json(
        { error: "Invalid orderId", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

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

    const service = new AccountingSnapshotMaterializeService(ports, gate);
    const countryIds =
      ctx.user.scope.type === "country"
        ? ctx.user.scope.countryIds ?? []
        : ctx.user.scope.type === "global"
          ? null
          : ctx.user.scope.countryIds ?? [];

    const result = await service.run({
      actor: {
        userId: ctx.user.id,
        role: ctx.user.role,
        permissions: ctx.user.permissions as FinancePermission[],
        countryIds,
      },
      dryRun,
      orderIds,
      scanLimit: body.scanLimit,
      applyLimit: body.applyLimit,
      clientKey,
      correlationId,
      includeQaFixtures: body.includeQaFixtures === true,
    });

    return jsonWithIds(
      {
        ...result,
        limits: {
          maxApply: ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_APPLY,
          maxScan: ACCOUNTING_SNAPSHOT_MATERIALIZE_MAX_SCAN,
        },
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
        productionWriteExecuted: !dryRun && result.productionWrites > 0,
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
    if (message.startsWith("WRITE_RUNTIME_UNAVAILABLE")) {
      return NextResponse.json(
        { error: sanitizeErrorMessage(error), code: "WRITE_RUNTIME_UNAVAILABLE" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}

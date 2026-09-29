/**
 * GET /api/finance/archive — historical finance archive (READ-ONLY).
 * Pre-cutover records only. No prepare/approve/pay/reconcile.
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
  getFinanceReportingReadService,
  parseFinanceFilters,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import {
  isPreCutover,
  resolveFinanceCutoverDate,
} from "@/domain/finance/cutover/FinanceCutoverConfig";
import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";

const DATA_CLASSES = new Set<AccountantDataClass>([
  "certified",
  "operational",
  "historical",
  "qa_test",
  "incomplete",
  "conflict",
  "uncertified",
]);

export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");

    const env = getEnv();
    const cutover = resolveFinanceCutoverDate({
      cutoverDate: env.FINANCE_CUTOVER_DATE.trim() || "2026-10-01",
      timezone: "Asia/Riyadh",
      approved: env.FINANCE_CUTOVER_APPROVED,
    });

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const rawClass = url.searchParams.get("dataClass");
    const dataClass =
      rawClass && DATA_CLASSES.has(rawClass as AccountantDataClass)
        ? (rawClass as AccountantDataClass)
        : null;
    const filters = parseFinanceFilters(url.searchParams);
    filters.includePilotRecords = true;
    filters.includeLegacy = true;
    // Cap archive window to before cutover
    filters.periodToUtc = cutover.cutoverUtcInstant;

    const service = await getFinanceReportingReadService({
      countryId: filters.countryId,
    });
    const result = service.globalFinancialExplorer(
      toFinanceReportingActor(ctx),
      filters,
      { dataClass, limit: 500 },
    );

    const items = result.items.filter((row) => {
      if (!isPreCutover(row.occurredAtUtc, cutover.cutoverUtcInstant)) {
        return false;
      }
      if (q) {
        const hay =
          `${row.id} ${row.partyId ?? ""} ${row.relatedOrderId ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });

    return jsonWithIds(
      {
        cutover,
        readOnly: true as const,
        allowedActions: ["search", "filter", "view", "export"] as const,
        deniedActions: [
          "prepare",
          "approve",
          "execute",
          "reconcile",
          "modify",
        ] as const,
        items,
        total: items.length,
        byClass: result.byClass,
        officialTotalsIsolated: true as const,
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

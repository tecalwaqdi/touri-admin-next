/**
 * Block approve / payment / mutation on legacy orphan settlements.
 * Read-only isolation — never invent sourceSnapshotId or mutate history.
 */

import { getFinanceReportingReadService } from "@/application/finance/reporting/getFinanceReportingReadService";

export class LegacySettlementMutationDeniedError extends Error {
  readonly code = "LEGACY_SETTLEMENT_READ_ONLY";
  constructor(settlementId: string) {
    super(
      `legacy_settlement_read_only:${settlementId}:no_certified_accounting_snapshot`,
    );
    this.name = "LegacySettlementMutationDeniedError";
  }
}

/**
 * Throws when the settlement is a legacy/orphan (no certified snapshot link).
 * Safe no-op when the settlement is absent from the reporting bundle (caller
 * handles NOT_FOUND separately).
 */
export async function assertSettlementNotLegacyOrphan(
  settlementId: string,
): Promise<void> {
  const service = await getFinanceReportingReadService({
    settlementId,
  });
  if (service.isLegacyOrphanSettlement(settlementId)) {
    throw new LegacySettlementMutationDeniedError(settlementId);
  }
}

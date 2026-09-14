/**
 * Phase 4A-0 — ShadowComparisonService.
 * Outcomes: match | mismatch | warning | not_comparable.
 * Money: exact minor-unit. Counts: exact. No FX conversion.
 * Mismatch → MAPPING_MISMATCH — never change Legacy.
 */

import { MAPPING_MISMATCH_CODE } from "@/domain/production-read/constants";

export type ShadowComparableCount = {
  resource: string;
  count: number;
};

export type ShadowComparableMoney = {
  field: string;
  minorUnits: number;
  currencyCode: string;
};

export type ShadowComparableStatus = {
  id: string;
  statusCode: string;
};

export type ShadowComparisonSide = {
  label: "admin_next" | "legacy_fixture" | "production_shadow";
  counts: ShadowComparableCount[];
  money: ShadowComparableMoney[];
  statuses: ShadowComparableStatus[];
  /** When set, comparison may be not_comparable (e.g. different currencies). */
  comparable?: boolean;
  warnings?: string[];
};

export type ShadowMismatch = {
  code: typeof MAPPING_MISMATCH_CODE;
  category: "count" | "money" | "status";
  field: string;
  expected: string | number;
  actual: string | number;
};

export type ShadowComparisonOutcome =
  | "match"
  | "mismatch"
  | "warning"
  | "not_comparable";

export type ShadowComparisonResult = {
  ok: boolean;
  outcome: ShadowComparisonOutcome;
  mismatches: ShadowMismatch[];
  warnings: string[];
};

export interface ShadowComparisonService {
  compare(
    left: ShadowComparisonSide,
    right: ShadowComparisonSide,
  ): ShadowComparisonResult;
}

export class DefaultShadowComparisonService implements ShadowComparisonService {
  compare(
    left: ShadowComparisonSide,
    right: ShadowComparisonSide,
  ): ShadowComparisonResult {
    if (left.comparable === false || right.comparable === false) {
      return {
        ok: false,
        outcome: "not_comparable",
        mismatches: [],
        warnings: [
          ...(left.warnings ?? []),
          ...(right.warnings ?? []),
          "sides marked not_comparable",
        ],
      };
    }

    // Different money currencies across same field → not_comparable (no FX)
    for (const lm of left.money) {
      const rm = right.money.find((m) => m.field === lm.field);
      if (rm && rm.currencyCode !== lm.currencyCode) {
        return {
          ok: false,
          outcome: "not_comparable",
          mismatches: [],
          warnings: [
            `currency mismatch for ${lm.field}: ${lm.currencyCode} vs ${rm.currencyCode} (no FX)`,
          ],
        };
      }
    }

    const mismatches: ShadowMismatch[] = [];
    const warnings = [...(left.warnings ?? []), ...(right.warnings ?? [])];

    for (const lc of left.counts) {
      const rc = right.counts.find((c) => c.resource === lc.resource);
      if (!rc || rc.count !== lc.count) {
        mismatches.push({
          code: MAPPING_MISMATCH_CODE,
          category: "count",
          field: lc.resource,
          expected: lc.count,
          actual: rc?.count ?? "missing",
        });
      }
    }

    for (const lm of left.money) {
      const rm = right.money.find(
        (m) => m.field === lm.field && m.currencyCode === lm.currencyCode,
      );
      if (!rm || rm.minorUnits !== lm.minorUnits) {
        mismatches.push({
          code: MAPPING_MISMATCH_CODE,
          category: "money",
          field: lm.field,
          expected: lm.minorUnits,
          actual: rm?.minorUnits ?? "missing",
        });
      }
    }

    for (const ls of left.statuses) {
      const rs = right.statuses.find((s) => s.id === ls.id);
      if (!rs || rs.statusCode !== ls.statusCode) {
        mismatches.push({
          code: MAPPING_MISMATCH_CODE,
          category: "status",
          field: ls.id,
          expected: ls.statusCode,
          actual: rs?.statusCode ?? "missing",
        });
      }
    }

    if (mismatches.length > 0) {
      return {
        ok: false,
        outcome: "mismatch",
        mismatches,
        warnings,
      };
    }
    if (warnings.length > 0) {
      return { ok: true, outcome: "warning", mismatches: [], warnings };
    }
    return { ok: true, outcome: "match", mismatches: [], warnings: [] };
  }
}

/** @deprecated alias — Prefer DefaultShadowComparisonService */
export class NoopShadowComparisonService extends DefaultShadowComparisonService {}

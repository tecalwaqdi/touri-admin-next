/**
 * Finance policy codes — locked registry vocabulary.
 * FC-01 APPROVED at 15% versioned config; missing config still fail-closed.
 * FC-02..FC-05 APPROVED (F6). Not Production write enablement.
 */

export const FINANCE_POLICY_CODES = [
  "FC-01",
  "FC-02",
  "FC-03",
  "FC-04",
  "FC-05",
] as const;

export type FinancePolicyCode = (typeof FINANCE_POLICY_CODES)[number];

export type FinancePolicyLockStatus =
  | "APPROVED"
  | "CONFIG_REQUIRED"
  | "NOT_APPROVED"
  | "DRAFT";

/** Explicit fail-closed code for any live calc that needs FC-01. */
export const FINANCE_POLICY_UNRESOLVED_FC01 = "FINANCE_POLICY_UNRESOLVED_FC01";

export class FinancePolicyUnresolvedFc01Error extends Error {
  readonly code = FINANCE_POLICY_UNRESOLVED_FC01;
  constructor(detail?: string) {
    super(
      detail
        ? `${FINANCE_POLICY_UNRESOLVED_FC01}:${detail}`
        : FINANCE_POLICY_UNRESOLVED_FC01,
    );
    this.name = "FinancePolicyUnresolvedFc01Error";
  }
}

export function isFinancePolicyUnresolvedFc01(err: unknown): boolean {
  if (err instanceof FinancePolicyUnresolvedFc01Error) return true;
  if (err instanceof Error) {
    return err.message.startsWith(FINANCE_POLICY_UNRESOLVED_FC01);
  }
  return false;
}

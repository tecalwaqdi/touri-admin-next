/**
 * Phase 5E — Why Driver needs_changes is the safest first Pilot action.
 * Assessment only — does not execute.
 */

export const WHY_DRIVER_NEEDS_CHANGES_IS_SAFEST = {
  recommendedPilot: {
    resource: "driver" as const,
    action: "needs_changes" as const,
    transition: "pending_review→needs_changes" as const,
  },
  comparisons: [
    {
      candidate: "driver.needs_changes",
      blastRadius: "low",
      whySafer:
        "Registration review signal only; account stays inactive; no Auth; reversible via proven resubmit/recovery; no trip/finance.",
    },
    {
      candidate: "driver.approve",
      blastRadius: "medium",
      whyRiskier:
        "Enables operational driver path (approval); higher user/ops blast than needs_changes.",
    },
    {
      candidate: "driver.suspend",
      blastRadius: "medium",
      whyRiskier:
        "Disables approved account path; requires approved before-state; trip guard complexity.",
    },
    {
      candidate: "agent.activate",
      blastRadius: "high",
      whyRiskier:
        "One-country-one-active invariant; deny-if-other-active races; cross-agent impact.",
    },
    {
      candidate: "customer.block",
      blastRadius: "medium",
      whyRiskier: "User-facing block; shared-user contamination surface; Auth sync risk later.",
    },
    {
      candidate: "customer.disable",
      blastRadius: "medium",
      whyRiskier:
        "User-facing disable; active-trip guard; still broader than synthetic driver review.",
    },
  ],
  verdict:
    "Driver needs_changes on a dedicated synthetic Production Driver is the lowest blast-radius " +
    "allowlisted mutation: no Auth write, no finance, no trip mutation, no Agent uniqueness risk, " +
    "account not activated, highly reversible vs approve/suspend/activate/block/disable.",
} as const;

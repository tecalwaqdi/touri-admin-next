/**
 * Shared source-label badge for Admin Next pages.
 * Operator UI: technical production/synthetic badges are suppressed.
 */

"use client";

import type { AdminDataSourceLabelView } from "@/domain/production-read/SourceLabel";

export function SourceLabelBadge(_props: {
  source?: AdminDataSourceLabelView | null;
  /** Fallback when API omits source — prefer explicit unavailable over synthetic. */
  fallback?: AdminDataSourceLabelView;
  testId?: string;
}) {
  return null;
}

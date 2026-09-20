"use client";

import { PRODUCTION_STATUS_BANNER } from "@/domain/production-read/constants";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

/**
 * Production status banner (EN + AR).
 * Shown when UI mode is production_shadow (Production reads armed).
 * Copy must not say SHADOW — Admin Next is operational.
 * Controlled-write chrome is reflected via data-writes-armed; server gates remain authoritative.
 */
export function ShadowBanner(props: { active?: boolean }) {
  if (!props.active) return null;
  const writesArmed = isControlledWriteChromeEnabled();
  return (
    <div
      data-testid="shadow-banner"
      data-writes-armed={writesArmed ? "true" : "false"}
      data-production-status="operational"
      role="status"
      className="border-b border-emerald-800/50 bg-emerald-950 px-4 py-1.5 text-center text-sm text-emerald-50"
    >
      <p className="font-semibold tracking-wide">
        {PRODUCTION_STATUS_BANNER.en}
      </p>
      <p className="mt-0.5 opacity-90" dir="rtl" lang="ar">
        {PRODUCTION_STATUS_BANNER.ar}
      </p>
    </div>
  );
}

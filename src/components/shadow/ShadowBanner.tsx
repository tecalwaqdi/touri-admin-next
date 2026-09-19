"use client";

import {
  SHADOW_BANNER,
  SHADOW_BANNER_WRITES_ARMED,
} from "@/domain/production-read/constants";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

/**
 * Phase 4A-0 — Shadow banner (EN + AR).
 * Shown only when UI mode is production_shadow (not active by default).
 * When controlled-write chrome is armed, do NOT claim READ ONLY — writes are
 * gated server-side; the banner must not contradict enabled write domains.
 */
export function ShadowBanner(props: { active?: boolean }) {
  if (!props.active) return null;
  const writesArmed = isControlledWriteChromeEnabled();
  const copy = writesArmed ? SHADOW_BANNER_WRITES_ARMED : SHADOW_BANNER;
  return (
    <div
      data-testid="shadow-banner"
      data-writes-armed={writesArmed ? "true" : "false"}
      role="status"
      className="border-b border-amber-700/40 bg-amber-950 px-4 py-2 text-center text-sm text-amber-100"
    >
      <p className="font-semibold tracking-wide">{copy.en}</p>
      <p className="mt-0.5 opacity-90" dir="rtl" lang="ar">
        {copy.ar}
      </p>
    </div>
  );
}

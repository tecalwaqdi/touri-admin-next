"use client";

import { SHADOW_BANNER } from "@/domain/production-read/constants";

/**
 * Phase 4A-0 — Shadow banner (EN + AR).
 * Shown only when UI mode is production_shadow (not active by default).
 */
export function ShadowBanner(props: { active?: boolean }) {
  if (!props.active) return null;
  return (
    <div
      data-testid="shadow-banner"
      role="status"
      className="border-b border-amber-700/40 bg-amber-950 px-4 py-2 text-center text-sm text-amber-100"
    >
      <p className="font-semibold tracking-wide">{SHADOW_BANNER.en}</p>
      <p className="mt-0.5 opacity-90" dir="rtl" lang="ar">
        {SHADOW_BANNER.ar}
      </p>
    </div>
  );
}

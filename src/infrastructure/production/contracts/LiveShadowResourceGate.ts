/**
 * Phase 4A-1/4A-2/4A-3/4A-4/4A-5 — LIVE_SHADOW_ALLOWED_RESOURCES gate.
 * Controlled windows are single-resource: countries | cities | landmarks | trips | drivers.
 * Any non-allowlisted resource → LIVE_RESOURCE_NOT_ENABLED.
 */

export const LIVE_SHADOW_RESOURCES = [
  "countries",
  "cities",
  "landmarks",
  "trips",
  "drivers",
  "agents",
  "customers",
] as const;

export type LiveShadowResource = (typeof LIVE_SHADOW_RESOURCES)[number];

export class LiveResourceNotEnabledError extends Error {
  readonly code = "LIVE_RESOURCE_NOT_ENABLED";
  constructor(readonly resource: string) {
    super(`LIVE_RESOURCE_NOT_ENABLED: ${resource}`);
    this.name = "LiveResourceNotEnabledError";
  }
}

export function parseLiveShadowAllowedResources(
  raw: string | null | undefined,
): Set<LiveShadowResource> {
  if (raw == null || !String(raw).trim()) {
    return new Set();
  }
  const out = new Set<LiveShadowResource>();
  for (const part of String(raw).split(",")) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    if (!(LIVE_SHADOW_RESOURCES as readonly string[]).includes(token)) {
      throw new Error(
        `Unknown LIVE_SHADOW_ALLOWED_RESOURCES token: ${token}`,
      );
    }
    out.add(token as LiveShadowResource);
  }
  return out;
}

export function isLiveShadowResourceAllowed(
  allowed: ReadonlySet<string> | readonly string[],
  resource: LiveShadowResource | string,
): boolean {
  const set =
    allowed instanceof Set
      ? allowed
      : new Set([...allowed].map((r) => r.trim().toLowerCase()));
  return set.has(resource.trim().toLowerCase());
}

export function assertLiveShadowResourceAllowed(
  allowed: ReadonlySet<string> | readonly string[],
  resource: LiveShadowResource | string,
): void {
  if (!isLiveShadowResourceAllowed(allowed, resource)) {
    throw new LiveResourceNotEnabledError(resource);
  }
}

/** Phase 4A-1 controlled window expectation. */
export const PHASE_4A1_LIVE_RESOURCES = ["countries"] as const;

/** Phase 4A-2 controlled window expectation (resource token; Firestore collection = villages). */
export const PHASE_4A2_LIVE_RESOURCES = ["cities"] as const;

/** Phase 4A-3 controlled window expectation (resource token; Firestore collection = mkan). */
export const PHASE_4A3_LIVE_RESOURCES = ["landmarks"] as const;

/** Phase 4A-4 controlled window expectation (resource token; Firestore collection = order). */
export const PHASE_4A4_LIVE_RESOURCES = ["trips"] as const;

/** Phase 4A-5 controlled window expectation (resource token; Firestore collection = user + ismndob). */
export const PHASE_4A5_LIVE_RESOURCES = ["drivers"] as const;

/** Phase 4A-6 controlled window expectation (resource token; Firestore collection = user + Isagent). */
export const PHASE_4A6_LIVE_RESOURCES = ["agents"] as const;

/** Phase 4A-7 controlled window expectation (resource token; Firestore collection = user exclusionary customers). */
export const PHASE_4A7_LIVE_RESOURCES = ["customers"] as const;

/**
 * Phase 4B cross-resource shadow validation — all closed 4A resource tokens.
 * No wildcard / genericQuery; each token still maps to its bounded repo only.
 */
export const PHASE_4B_LIVE_RESOURCES = [
  "countries",
  "cities",
  "landmarks",
  "trips",
  "drivers",
  "agents",
  "customers",
] as const;

export function isExactLiveShadowAllowlist(
  allowed: ReadonlySet<string>,
  expected: readonly string[],
): boolean {
  if (allowed.size !== expected.length) return false;
  return expected.every((r) => allowed.has(r));
}

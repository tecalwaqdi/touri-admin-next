import { describe, expect, it } from "vitest";

/**
 * Mirrors Legacy `evaluateLegacyAdminWriteGate` (ara-ban finance_feature_flags.js).
 * Ensures Admin Next cutover criteria stay aligned with Legacy fail-closed policy.
 */
function evaluateLegacyAdminWriteGate(input: {
  mode: string;
  flagEnabled: boolean;
  isSuperAdmin: boolean;
}): { allowed: boolean; code: string | null } {
  const mode = String(input.mode || "unrestricted").trim().toLowerCase();
  if (mode === "read_only") {
    return { allowed: false, code: "LEGACY_ADMIN_READ_ONLY" };
  }
  if (mode === "super_admin_emergency_only") {
    if (!input.isSuperAdmin) {
      return { allowed: false, code: "LEGACY_ADMIN_SUPER_ADMIN_EMERGENCY_ONLY" };
    }
    return { allowed: true, code: null };
  }
  if (input.flagEnabled === true) return { allowed: true, code: null };
  return { allowed: false, code: "FEATURE_FLAG_DISABLED" };
}

describe("Legacy Admin cutover write restriction (mirror)", () => {
  it("blocks financial writes in read_only even for Super Admin", () => {
    const r = evaluateLegacyAdminWriteGate({
      mode: "read_only",
      flagEnabled: true,
      isSuperAdmin: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("LEGACY_ADMIN_READ_ONLY");
  });

  it("super_admin_emergency_only denies non–Super Admin", () => {
    const r = evaluateLegacyAdminWriteGate({
      mode: "super_admin_emergency_only",
      flagEnabled: true,
      isSuperAdmin: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("LEGACY_ADMIN_SUPER_ADMIN_EMERGENCY_ONLY");
  });

  it("super_admin_emergency_only allows Super Admin without domain flag", () => {
    const r = evaluateLegacyAdminWriteGate({
      mode: "super_admin_emergency_only",
      flagEnabled: false,
      isSuperAdmin: true,
    });
    expect(r.allowed).toBe(true);
  });

  it("unrestricted still requires domain feature flag", () => {
    const r = evaluateLegacyAdminWriteGate({
      mode: "unrestricted",
      flagEnabled: false,
      isSuperAdmin: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("FEATURE_FLAG_DISABLED");
  });
});

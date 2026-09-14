import { describe, expect, it } from "vitest";
import {
  canAccess,
  hasPermission,
  permissionsForRole,
} from "@/permissions/rbac";

describe("permission evaluation", () => {
  it("grants super_admin all permissions", () => {
    const perms = permissionsForRole("super_admin");
    expect(hasPermission(perms, "users:manage")).toBe(true);
    expect(hasPermission(perms, "settlements:approve")).toBe(true);
  });

  it("denies support_agent finance write-ish permissions", () => {
    const perms = permissionsForRole("support_agent");
    expect(hasPermission(perms, "finance:read")).toBe(false);
    expect(hasPermission(perms, "settlements:approve")).toBe(false);
    expect(hasPermission(perms, "trips:read")).toBe(true);
  });

  it("requires every permission in a list", () => {
    const perms = permissionsForRole("accountant");
    expect(hasPermission(perms, ["finance:read", "settlements:create"])).toBe(true);
    expect(hasPermission(perms, ["finance:read", "settlements:approve"])).toBe(false);
  });

  it("evaluates canAccess with permission + resource", () => {
    const perms = permissionsForRole("country_admin");
    expect(
      canAccess(perms, { type: "country", countryIds: ["SA"] }, "trips:read", {
        countryId: "SA",
      }),
    ).toBe(true);
    expect(
      canAccess(perms, { type: "country", countryIds: ["SA"] }, "trips:read", {
        countryId: "AE",
      }),
    ).toBe(false);
  });
});

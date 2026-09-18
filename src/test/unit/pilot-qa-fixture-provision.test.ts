import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultQaId } from "@/application/controlled-writes/pilot/PilotQaFixtureProvision";

describe("pilot QA fixture API routes", () => {
  it("geography qa-fixture route exists", () => {
    const path = join(process.cwd(), "src/app/api/geography/qa-fixture/route.ts");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/ensureGeographyQaFixture/);
  });

  it("p0 qa-fixture route exists", () => {
    const path = join(process.cwd(), "src/app/api/p0/qa-fixture/route.ts");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/ensureP0QaFixture/);
  });

  it("support qa-fixture route exists", () => {
    const path = join(process.cwd(), "src/app/api/support/qa-fixture/route.ts");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/ensureSupportQaFixture/);
  });

  it("defaultQaId uses test_adminnext prefix", () => {
    expect(defaultQaId("landmark", "x")).toMatch(/^test_adminnext_landmark_/);
  });
});

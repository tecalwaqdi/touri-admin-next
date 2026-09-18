import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("agent production pilot harness", () => {
  it("runner exists and writes 02-agent.json artifact", () => {
    const path = join(process.cwd(), "scripts/run-agent-production-pilot.mjs");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/02-agent\.json/);
    expect(src).toMatch(/AGENT_WRITE_ENABLED/);
    expect(src).toMatch(/driverNegativeProbe/);
    expect(src).toMatch(/BLOCKED_FIXTURE_MISSING/);
  });
});

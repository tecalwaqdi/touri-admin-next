import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
const DEFINITIONS_SRC = readFileSync(
  join(ROOT, "scripts/lib/domain-pilot-definitions.mjs"),
  "utf8",
);

const RUNNERS: Array<{ key: string; script: string; artifact: string; gate: string }> = [
  { key: "region", script: "run-region-production-pilot.mjs", artifact: "04a-region.json", gate: "REGION_WRITE_ENABLED" },
  { key: "city", script: "run-city-production-pilot.mjs", artifact: "04b-city.json", gate: "GEOGRAPHY_WRITE_ENABLED" },
  { key: "landmark", script: "run-landmark-production-pilot.mjs", artifact: "04c-landmark.json", gate: "GEOGRAPHY_WRITE_ENABLED" },
  { key: "vehicle_catalog", script: "run-vehicle-catalog-production-pilot.mjs", artifact: "05-vehicle-catalog.json", gate: "VEHICLE_CATALOG_WRITE_ENABLED" },
  { key: "partner", script: "run-partner-production-pilot.mjs", artifact: "06-partner.json", gate: "PARTNER_WRITE_ENABLED" },
  { key: "fleet", script: "run-fleet-production-pilot.mjs", artifact: "07-fleet.json", gate: "FLEET_WRITE_ENABLED" },
  { key: "guide", script: "run-guide-production-pilot.mjs", artifact: "08-guide.json", gate: "GUIDE_WRITE_ENABLED" },
  { key: "support", script: "run-support-production-pilot.mjs", artifact: "09-support.json", gate: "SUPPORT_WRITE_ENABLED" },
  { key: "notification", script: "run-notification-production-pilot.mjs", artifact: "10-notifications.json", gate: "NOTIFICATION_WRITE_ENABLED" },
  { key: "identity", script: "run-identity-production-pilot.mjs", artifact: "11-identity.json", gate: "ADMIN_IDENTITY_WRITE_ENABLED" },
  { key: "finance", script: "run-finance-production-pilot.mjs", artifact: "12-finance.json", gate: "FINANCE_WRITE_ENABLED" },
];

describe("domain production pilot harness catalog", () => {
  it("definitions align with runner scripts", () => {
    for (const row of RUNNERS) {
      expect(DEFINITIONS_SRC).toMatch(new RegExp(`artifact:\\s*"${row.artifact}"`));
      expect(DEFINITIONS_SRC).toMatch(new RegExp(`primaryGate:\\s*"${row.gate}"`));
      const path = join(ROOT, "scripts", row.script);
      expect(existsSync(path)).toBe(true);
      const src = readFileSync(path, "utf8");
      expect(src).toMatch(/runDomainProductionPilot/);
      expect(src).toMatch(new RegExp(`"${row.key}"`));
    }
  });

  it("shared harness preserves DRIVER+AGENT pass domains", () => {
    const harness = readFileSync(
      join(ROOT, "scripts/lib/domain-production-pilot-harness.mjs"),
      "utf8",
    );
    expect(harness).toMatch(/resolvePreservePassDomains/);
    const gateCycle = readFileSync(
      join(ROOT, "scripts/lib/pilot-gate-cycle.mjs"),
      "utf8",
    );
    expect(gateCycle).toMatch(/DRIVER_WRITE_ENABLED/);
    expect(gateCycle).toMatch(/AGENT_WRITE_ENABLED/);
    expect(gateCycle).toMatch(/PASS_ARTIFACT_PRESERVE_GATES/);
    expect(gateCycle).toMatch(/SUPPORT_WRITE_ENABLED/);
    expect(gateCycle).toMatch(/GEOGRAPHY_WRITE_ENABLED/);
    expect(gateCycle).toMatch(/REGION_WRITE_ENABLED/);
    expect(harness).toMatch(/financeNegativeProbe/);
    expect(harness).toMatch(/BLOCKED_FIXTURE_MISSING/);
  });

  it("notification harness documents BLOCKED_NO_SAFE_FIXTURE", () => {
    expect(DEFINITIONS_SRC).toMatch(/blockedNoSafeFixture:\s*true/);
    const harness = readFileSync(
      join(ROOT, "scripts/lib/domain-production-pilot-harness.mjs"),
      "utf8",
    );
    expect(harness).toMatch(/BLOCKED_NO_SAFE_FIXTURE/);
  });

  it("finish runner wires domain scripts", () => {
    const finish = readFileSync(
      join(ROOT, "scripts/finish-admin-next-production.mjs"),
      "utf8",
    );
    for (const row of RUNNERS) {
      expect(finish).toMatch(row.script.replace("scripts/", ""));
    }
    expect(finish).toMatch(/SKIP_COMPLETED_REGION_PILOT/);
    expect(finish).toMatch(/fixtureEnv/);
  });
});

/**
 * PC-9 — Controlled admin writes (gated; Production arms FALSE).
 * Covers inventory, exposure, security static audit, and PC-1..8 invariants.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROLLED_WRITES_ENABLEMENT,
  assertEnablementNotActivated,
  DEFAULT_CONSOLIDATION_FLAGS_FALSE,
  allConsolidationWriteFlagsDisabled,
  assertConsolidationProductionGates,
  ControlledWriteConsolidationError,
  isDeniedWriteResource,
  isAllowedWriteResource,
} from "@/application/controlled-writes";
import {
  PC9_CONTROLLED_WRITE_INVENTORY,
  PC9_WRITE_EXPOSURE_REPORT,
  assertPc9ProductionWriteArmsDisabled,
} from "@/domain/controlled-writes/Pc9ControlledWriteInventory";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { formatControlledWriteConfirm } from "@/domain/ui/formatControlledWriteConfirm";
import { messages, t } from "@/i18n/messages";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { loadEnv, resetEnvCache, SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import { assertProductionWriteAllowed, ProductionWriteBlockedError } from "@/config/safety";
import { scanProductionWriteSurface } from "../../../scripts/scan-production-write-surface";
import { listMutationRoutes } from "@/infrastructure/production/MutationRouteInventory";
import {
  PROVEN_DRIVER_STATE_TRANSITIONS,
  resolveDriverTransition,
} from "@/application/controlled-writes/drivers/DriverStateMachine";
import { assertNoOtherActiveAgentSync } from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walkTs(full, out);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("PC-9 Controlled Write Inventory + gates", () => {
  it("1: Inventory covers W1–W6 with Production arms false", () => {
    expect(PC9_CONTROLLED_WRITE_INVENTORY.map((r) => r.workstream)).toEqual([
      "W1",
      "W2",
      "W3",
      "W4",
      "W5",
      "W6",
    ]);
    for (const row of PC9_CONTROLLED_WRITE_INVENTORY) {
      expect(row.productionArmed).toBe(false);
    }
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "drivers")
        ?.readiness,
    ).toBe("READY_EXISTING");
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "agents")
        ?.readiness,
    ).toBe("READY_EXISTING");
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "geography")
        ?.readiness,
    ).toBe("READY_EXISTING");
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "finance")
        ?.readiness,
    ).toBe("READY_EXISTING");
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "customers")
        ?.readiness,
    ).toBe("READY_EXISTING");
    expect(
      PC9_CONTROLLED_WRITE_INVENTORY.find((r) => r.domain === "users_roles")
        ?.readiness,
    ).toBe("READY_EXISTING");
  });

  it("2: Enablement — local ready, Production activation false", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesImplemented).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesValidatedOffline).toBe(
      true,
    );
    expect(CONTROLLED_WRITES_ENABLEMENT.localOfflineWritesReady).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesUiChromeGated).toBe(
      true,
    );
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(() => assertEnablementNotActivated()).not.toThrow();
  });

  it("3: Consolidation Production gates deny with distinct codes; allow when armed", () => {
    expect(allConsolidationWriteFlagsDisabled(DEFAULT_CONSOLIDATION_FLAGS_FALSE)).toBe(
      true,
    );
    expect(() =>
      assertConsolidationProductionGates("driver", DEFAULT_CONSOLIDATION_FLAGS_FALSE),
    ).toThrow(ControlledWriteConsolidationError);
    try {
      assertConsolidationProductionGates("driver", {
        ...DEFAULT_CONSOLIDATION_FLAGS_FALSE,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: false,
      });
      expect.unreachable("should deny domain off");
    } catch (err) {
      expect(err).toBeInstanceOf(ControlledWriteConsolidationError);
      expect((err as ControlledWriteConsolidationError).code).toBe(
        "RESOURCE_WRITE_DISABLED",
      );
    }
    expect(() =>
      assertConsolidationProductionGates("driver", {
        ...DEFAULT_CONSOLIDATION_FLAGS_FALSE,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: true,
      }),
    ).not.toThrow();
  });

  it("4: Driver legal transition matrix enforced", () => {
    expect(PROVEN_DRIVER_STATE_TRANSITIONS.length).toBeGreaterThanOrEqual(5);
    expect(resolveDriverTransition("approve", "pending_review").ok).toBe(true);
    expect(resolveDriverTransition("approve", "approved").ok).toBe(false);
    expect(resolveDriverTransition("suspend", "pending_review").ok).toBe(false);
  });

  it("5: Agent one-country-one-active fail-closed", () => {
    expect(() =>
      assertNoOtherActiveAgentSync({
        countryId: "SA",
        agentId: "a1",
        activeAgentId: "a2",
      }),
    ).toThrow(AgentWriteError);
    expect(() =>
      assertNoOtherActiveAgentSync({
        countryId: "SA",
        agentId: "a1",
        activeAgentId: "a1",
      }),
    ).not.toThrow();
  });

  it("6: Geography / users / roles denied write resources", () => {
    expect(isAllowedWriteResource("geography")).toBe(false);
    expect(isDeniedWriteResource("geography")).toBe(true);
    expect(isDeniedWriteResource("users")).toBe(true);
    expect(isDeniedWriteResource("roles")).toBe(true);
    expect(isDeniedWriteResource("claims")).toBe(true);
    expect(src("src/app/api/users/route.ts")).not.toMatch(
      /export async function (POST|PUT|PATCH|DELETE)/,
    );
    expect(src("src/app/api/roles/route.ts")).not.toMatch(
      /export async function (POST|PUT|PATCH|DELETE)/,
    );
    expect(src("src/app/api/geography/countries/route.ts")).not.toMatch(
      /export async function (POST|PUT|PATCH|DELETE)/,
    );
  });

  it("7: AR/EN confirmation templates present and format correctly", () => {
    const enKeys = Object.keys(messages.en).sort();
    const arKeys = Object.keys(messages.ar).sort();
    expect(enKeys).toEqual(arKeys);
    for (const key of [
      "confirmDriverWrite",
      "confirmAgentWrite",
      "confirmCustomerWrite",
    ] as const) {
      expect(messages.en[key]).toContain("{action}");
      expect(messages.en[key]).toContain("{id}");
      expect(messages.ar[key].length).toBeGreaterThan(10);
    }
    expect(messages.en.confirmAgentActivateWarning.toLowerCase()).toMatch(
      /one active agent/,
    );
    expect(messages.ar.confirmAgentActivateWarning.length).toBeGreaterThan(10);
    const formatted = formatControlledWriteConfirm(t("en", "confirmDriverWrite"), {
      action: "Approve",
      id: "DRV-1",
      state: "pending_review",
    });
    expect(formatted).toContain("Approve");
    expect(formatted).toContain("DRV-1");
    expect(formatted).toContain("pending_review");
    expect(formatted).not.toContain("{action}");
  });

  it("8: Write chrome hidden in Production by default", () => {
    const prevEnv = process.env.NEXT_PUBLIC_APP_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI;
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    delete process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI;
    expect(isControlledWriteChromeEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI = "true";
    expect(isControlledWriteChromeEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_APP_ENV = prevEnv;
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI = prevFlag;
  });

  it("9: Env examples keep all write arms false incl. geography/auth", () => {
    const example = src(".env.example");
    for (const flag of [
      "PRODUCTION_WRITE_ENABLED=false",
      "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
      "DRIVER_WRITE_ENABLED=false",
      "AGENT_WRITE_ENABLED=false",
      "CUSTOMER_WRITE_ENABLED=false",
      "CUSTOMER_AUTH_WRITE_ENABLED=false",
      "FINANCE_WRITE_ENABLED=false",
      "GEOGRAPHY_WRITE_ENABLED=false",
      "NEXT_PUBLIC_CONTROLLED_WRITES_UI=false",
    ]) {
      expect(example).toContain(flag);
    }
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("GEOGRAPHY_WRITE_ENABLED");
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("CUSTOMER_AUTH_WRITE_ENABLED");
  });

  it("10: loadEnv Production-like defaults keep write arms false", () => {
    resetEnvCache();
    const env = loadEnv({
      NODE_ENV: "test",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_ENV: "development",
      AUTH_MODE: "mock",
      PRODUCTION_READ_MODE: "disabled",
      EXPECTED_ENVIRONMENT: "development",
      FINANCE_REPORTING_SOURCE_MODE: "synthetic",
    });
    assertPc9ProductionWriteArmsDisabled(env);
    expect(env.GEOGRAPHY_WRITE_ENABLED).toBe(false);
    expect(env.CUSTOMER_AUTH_WRITE_ENABLED).toBe(false);
    expect(() => assertProductionWriteAllowed("geography", env)).toThrow(
      ProductionWriteBlockedError,
    );
    resetEnvCache();
  });

  it("11: Mutation inventory includes driver/agent/customer actions", () => {
    const paths = listMutationRoutes().map((r) => r.path);
    expect(paths).toContain("/api/drivers/[id]/approve");
    expect(paths).toContain("/api/agents/[id]/activate");
    expect(paths).toContain("/api/customers/[id]/disable");
    expect(paths).toContain("/api/settlements/[id]/approve");
  });

  it("12: Settlement action routes shadow-trap mutations", () => {
    expect(
      src("src/app/api/settlements/[id]/[action]/route.ts"),
    ).toMatch(/maybeShadowTrapResponse/);
    const deny = shadowTrapForRequest({
      method: "POST",
      path: "/api/settlements/x/approve",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(deny.action).toBe("deny");
  });

  it("13: Write exposure report zeros for forbidden surfaces", () => {
    for (const cell of PC9_WRITE_EXPOSURE_REPORT) {
      expect(cell.productionWriteExecutable).toBe(false);
      expect(cell.genericWrite).toBe(0);
      expect(cell.arbitraryPatch).toBe(0);
      expect(cell.clientFirestore).toBe(0);
      expect(cell.saJson).toBe(0);
      expect(cell.adcWrite).toBe(0);
      expect(cell.syntheticProductionFallback).toBe(0);
    }
  });
});

describe("PC-9 Security static audit", () => {
  it("AA1: Production write surface scan clean", () => {
    const scan = scanProductionWriteSurface();
    expect(scan.ok).toBe(true);
    expect(scan.violations).toEqual([]);
    expect(scan.credentialPathHits).toEqual([]);
  });

  it("AA2: No client Firestore SDK writes in features", () => {
    const files = walkTs(join(process.cwd(), "src/features"));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (
        /from\s+["']firebase\/firestore["']/.test(text) ||
        /\.collection\s*\(/.test(text) ||
        /getFirestore\s*\(/.test(text)
      ) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it("AA3: Action routes use resolveApiActor — no header role trust", () => {
    for (const rel of [
      "src/app/api/drivers/[id]/[action]/route.ts",
      "src/app/api/agents/[id]/[action]/route.ts",
      "src/app/api/customers/[id]/[action]/route.ts",
    ]) {
      const text = src(rel);
      expect(text).toMatch(/resolveApiActor/);
      expect(text).toMatch(/requirePermission/);
      expect(text).not.toMatch(/headers\.get\(["']x-role/);
      expect(text).not.toMatch(/headers\.get\(["']x-user-role/);
    }
  });

  it("AA4: No generic write / arbitrary patch endpoint", () => {
    expect(src("src/application/controlled-writes/ControlledWritesService.ts")).toMatch(
      /genericWrite/,
    );
    expect(src("src/application/controlled-writes/ControlledWritesService.ts")).toMatch(
      /forbiddenGenericApis/,
    );
    const apiRoot = join(process.cwd(), "src/app/api");
    const files = walkTs(apiRoot);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/genericWrite\s*\(/);
      expect(text).not.toMatch(/arbitraryPatch/);
      expect(text).not.toMatch(/rawFirestoreMutation/);
    }
  });

  it("AA5: No SA JSON / private key material in production infra", () => {
    const files = walkTs(join(process.cwd(), "src/infrastructure/production"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // Reject embedded PEM material / key file loads — allow policy comments.
      expect(text).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
      expect(text).not.toMatch(/readFileSync\([^)]*serviceAccount/);
      expect(text).not.toMatch(/require\([^)]*serviceAccountKey\.json/);
    }
  });
});

describe("PC-9 Non-regression (PC-1..8 / FR / WIF)", () => {
  it("Z1: Write flags remain false in examples + finance default", () => {
    expect(src(".env.example")).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("Z2: Docs matrix + closure exist", () => {
    expect(src("docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md")).toMatch(
      /READY_EXISTING/,
    );
    expect(src("docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md")).toMatch(
      /ADMIN_IDENTITY_WRITE_ENABLED/,
    );
    expect(src("docs/ADMIN_NEXT_PC9_CLOSURE.md")).toMatch(
      /PRODUCTION FLAGS ARMED: NO/,
    );
  });

  it("Z3: Driver/agent/customer action routes require expectedCurrentState", () => {
    for (const rel of [
      "src/app/api/drivers/[id]/[action]/route.ts",
      "src/app/api/agents/[id]/[action]/route.ts",
      "src/app/api/customers/[id]/[action]/route.ts",
    ]) {
      expect(src(rel)).toMatch(/expectedCurrentState is required/);
      expect(src(rel)).toMatch(/idempotency-key/);
    }
  });
});

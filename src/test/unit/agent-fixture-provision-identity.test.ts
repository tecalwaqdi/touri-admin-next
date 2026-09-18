/**
 * Unit tests: identity production loadPort + agent fixture provisioning contracts.
 * Covers: partial Auth missing panel; reuse; wrong id reject; bounded retry;
 * idempotent; no duplicate; fixture only after complete; failure disarms Identity/Agent;
 * Driver not regressed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { executeIdentityControlledWrite } from "@/application/controlled-writes/identity/IdentityControlledWriteService";
import {
  FakeIdentityWriteRepository,
  ProductionIdentityWriteRepository,
} from "@/application/controlled-writes/identity/IdentityWriteRepository";
import { ProductionIdentityWriteLoadPort } from "@/application/controlled-writes/identity/ProductionIdentityWriteLoadPort";
import { buildIdentityPersonaPatch } from "@/application/controlled-writes/identity/IdentityWritePolicy";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type {
  IdentityWriteCommand,
  VerifiedIdentityWriteActor,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";

const ROOT = process.cwd();
const PROVISION = join(ROOT, "scripts/provision-agent-pilot-fixtures.mjs");
const ROUTE = join(ROOT, "src/app/api/users/[id]/[action]/route.ts");

const actor: VerifiedIdentityWriteActor = {
  uid: "admin_ops",
  role: "super_admin",
  permissions: ["users:manage"],
  scope: { type: "global" },
};

const FLAGS_ON = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: true,
  PRODUCTION_WRITE_ENABLED: true,
  ADMIN_IDENTITY_WRITE_ENABLED: true,
};

function baseCmd(
  overrides: Partial<IdentityWriteCommand> &
    Pick<IdentityWriteCommand, "action"> &
    Record<string, unknown>,
): IdentityWriteCommand {
  return {
    actor,
    targetUserId: "test_adminnext_agent_a_deadbeef",
    expectedCurrentRole: "unknown",
    expectedDisabled: false,
    preconditionToken: "unknown",
    idempotencyKey: `idem_${Math.random().toString(36).slice(2)}`,
    correlationId: "c1",
    reasonCode: "operational",
    ...overrides,
  } as IdentityWriteCommand;
}

describe("identity production loadPort + assign_agent_scope contract", () => {
  it("ROOT CAUSE: production route must not load from offlineStore", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toMatch(/createProductionIdentityWriteLoadPort/);
    expect(src).toMatch(/allowOffline[\s\S]*loadPort[\s\S]*offlineStore/);
    // Production path must wire ProductionIdentityWriteLoadPort (not only offlineStore.get)
    expect(src).toMatch(
      /loadPort = allowOffline[\s\S]*createProductionIdentityWriteLoadPort/,
    );
  });

  it("partial Auth/Firestore missing panel → USER_NOT_FOUND on assign_agent_scope", async () => {
    const port = new FakeProductionFirestoreWritePort();
    // Auth-only orphan: no user doc
    const load = new ProductionIdentityWriteLoadPort(port);
    const repo = new ProductionIdentityWriteRepository(FLAGS_ON, port);
    const result = await executeIdentityControlledWrite(
      baseCmd({
        action: "assign_agent_scope",
        agentId: "test_adminnext_agent_a_deadbeef",
        countryId: "saudi_arabia",
      }),
      {
        flags: FLAGS_ON,
        loadPort: load,
        repository: repo,
        idempotency: { async get() { return null; }, async put() {} },
        audit: {
          async recordIntent() { return { intentId: "i" }; },
          async recordResult() { return { resultId: "r" }; },
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("USER_NOT_FOUND");
  });

  it("create_persona then assign_agent_scope reuses UID and succeeds (idempotent path)", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const load = new ProductionIdentityWriteLoadPort(port);
    const repo = new ProductionIdentityWriteRepository(FLAGS_ON, port);
    const deps = {
      flags: FLAGS_ON,
      loadPort: load,
      repository: repo,
      idempotency: {
        store: new Map<string, unknown>(),
        async get(k: string) {
          return (this.store.get(k) as never) ?? null;
        },
        async put(k: string, v: unknown) {
          this.store.set(k, v);
        },
      },
      audit: {
        async recordIntent() { return { intentId: "i" }; },
        async recordResult() { return { resultId: "r" }; },
      },
    };

    const create = await executeIdentityControlledWrite(
      baseCmd({
        action: "create_persona",
        role: "country_admin",
        countryId: "saudi_arabia",
        agentId: "test_adminnext_agent_a_deadbeef",
        qaFixture: true,
        displayNameHint: "Admin Next QA Agent Fixture A",
        idempotencyKey: "create-1",
      }),
      deps,
    );
    expect(create.ok).toBe(true);

    const loaded = await load.load("test_adminnext_agent_a_deadbeef");
    expect(loaded?.exists).toBe(true);
    expect(loaded?.role).toBe("country_admin");

    const scope = await executeIdentityControlledWrite(
      baseCmd({
        action: "assign_agent_scope",
        agentId: "test_adminnext_agent_a_deadbeef",
        countryId: "saudi_arabia",
        idempotencyKey: "scope-1",
      }),
      deps,
    );
    expect(scope.ok).toBe(true);

    const snap = await port.getDocument(
      "user",
      "test_adminnext_agent_a_deadbeef",
    );
    expect(snap.data?.Isagent).toBe(true);
    expect(snap.data?.is_test).toBe(true);
    expect(snap.data?.qa_fixture).toBe(true);
    expect(snap.data?.actev_user).toBe(false);
    expect(snap.data?.is_panel_persona).toBe(true);

    // Idempotent create resume (ALREADY_EXISTS → merge)
    const create2 = await executeIdentityControlledWrite(
      baseCmd({
        action: "create_persona",
        role: "country_admin",
        countryId: "saudi_arabia",
        qaFixture: true,
        idempotencyKey: "create-2",
      }),
      deps,
    );
    expect(create2.ok).toBe(true);
    expect(port.mutations.filter((m) => m.id === "test_adminnext_agent_a_deadbeef").length).toBeGreaterThanOrEqual(2);
  });

  it("wrong id / empty target rejects via load null → USER_NOT_FOUND", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const load = new ProductionIdentityWriteLoadPort(port);
    const repo = new ProductionIdentityWriteRepository(FLAGS_ON, port);
    const result = await executeIdentityControlledWrite(
      baseCmd({
        action: "assign_agent_scope",
        targetUserId: "not_a_real_user",
        agentId: "not_a_real_user",
        countryId: "saudi_arabia",
      }),
      {
        flags: FLAGS_ON,
        loadPort: load,
        repository: repo,
        idempotency: { async get() { return null; }, async put() {} },
        audit: {
          async recordIntent() { return { intentId: "i" }; },
          async recordResult() { return { resultId: "r" }; },
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("USER_NOT_FOUND");
  });

  it("ProductionIdentityWriteRepository applies policy patch (not role/countryId-only stub)", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const repo = new ProductionIdentityWriteRepository(FLAGS_ON, port);
    const cmd = baseCmd({
      action: "assign_agent_scope",
      agentId: "agt1",
      countryId: "saudi_arabia",
      targetUserId: "u1",
      expectedCurrentRole: "country_admin",
      preconditionToken: "fs_ut_ut0",
    });
    port.seed("user", "u1", { isAdminRule: 2, is_panel_persona: true }, "ut0");
    const { patch, allowlistedFields } = buildIdentityPersonaPatch(cmd);
    await repo.apply({
      command: cmd,
      fromRole: "country_admin",
      fromDisabled: false,
      patch,
      allowlistedFields,
    });
    const snap = await port.getDocument("user", "u1");
    expect(snap.data?.Isagent).toBe(true);
    expect(snap.data?.agentId).toBe("agt1");
    expect(snap.data?.Rev_dloh_agent).toBeTruthy();
  });

  it("Fake create_persona works without prior seed (no false USER_NOT_FOUND)", async () => {
    const repo = new FakeIdentityWriteRepository();
    const result = await executeIdentityControlledWrite(
      baseCmd({
        action: "create_persona",
        role: "accountant",
        countryId: null,
      }),
      {
        flags: {
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          ADMIN_IDENTITY_WRITE_ENABLED: false,
        },
        loadPort: { async load(id) { return repo.get(id) ?? null; } },
        repository: repo,
        idempotency: { async get() { return null; }, async put() {} },
        audit: {
          async recordIntent() { return { intentId: "i" }; },
          async recordResult() { return { resultId: "r" }; },
        },
        allowOfflineExecution: true,
      },
    );
    expect(result.ok).toBe(true);
    expect(repo.get("test_adminnext_agent_a_deadbeef")?.exists).toBe(true);
  });

  it("soft unknown preconditions allow follow-up after create without token round-trip", async () => {
    const repo = new FakeIdentityWriteRepository();
    repo.seed({
      userId: "u2",
      exists: true,
      isPanelPersona: true,
      role: "country_admin",
      disabled: false,
      countryId: "saudi_arabia",
      agentId: null,
      superAdminCountHint: 2,
      preconditionToken: "fs_ut_real",
      reconciliation: "UNKNOWN",
    });
    const result = await executeIdentityControlledWrite(
      {
        actor,
        action: "assign_agent_scope",
        targetUserId: "u2",
        agentId: "u2",
        countryId: "saudi_arabia",
        expectedCurrentRole: "unknown",
        expectedDisabled: false,
        preconditionToken: "unknown",
        idempotencyKey: "soft-1",
        correlationId: "c",
        reasonCode: "operational",
      },
      {
        flags: {
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          ADMIN_IDENTITY_WRITE_ENABLED: false,
        },
        loadPort: { async load(id) { return repo.get(id) ?? null; } },
        repository: repo,
        idempotency: { async get() { return null; }, async put() {} },
        audit: {
          async recordIntent() { return { intentId: "i" }; },
          async recordResult() { return { resultId: "r" }; },
        },
        allowOfflineExecution: true,
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe("provision-agent-pilot-fixtures.mjs contracts", () => {
  it("script exists and encodes resumable + Driver preserve contracts", () => {
    expect(existsSync(PROVISION)).toBe(true);
    const src = readFileSync(PROVISION, "utf8");
    expect(src).toMatch(/POLL_MS|pollUntil|VERIFY_TIMEOUT/);
    expect(src).toMatch(/ID_CONTRACT_FAILED/);
    expect(src).toMatch(/assign_agent_scope/);
    expect(src).toMatch(/qaFixture:\s*true/);
    expect(src).toMatch(/agent-fixture\.json/);
    expect(src).toMatch(/RESTORE_DRIVER_NORMAL|DRIVER_NORMAL|driver_normal_write_restored/);
    // Must NOT disarm DRIVER in TEMP_DISARM
    expect(src).toMatch(/TEMP_DISARM/);
    const tempBlock = src.slice(
      src.indexOf("TEMP_DISARM"),
      src.indexOf("DRIVER_NORMAL"),
    );
    expect(tempBlock).not.toMatch(/"DRIVER_WRITE_ENABLED"/);
    expect(src).toMatch(/AGENT_WRITE_ENABLED.*false/);
    expect(src).toMatch(/reuse panel|reuse agent|partial/);
    expect(src).toMatch(/DUPLICATE_QA_AGENTS/);
    expect(src).toMatch(/FIXTURE_BOTH_ACTIVE/);
    expect(src).toMatch(/writeFileSync\(FIXTURE_PATH/);
  });

  it("qa create_persona patch includes inactive markers for concurrency pilot", () => {
    const { patch } = buildIdentityPersonaPatch({
      actor,
      action: "create_persona",
      targetUserId: "test_x",
      role: "country_admin",
      countryId: "saudi_arabia",
      qaFixture: true,
      displayNameHint: "QA A",
      expectedCurrentRole: "unknown",
      expectedDisabled: false,
      preconditionToken: "unknown",
      idempotencyKey: "k",
      correlationId: "c",
      reasonCode: "operational",
    });
    expect(patch.is_test).toBe(true);
    expect(patch.qa_fixture).toBe(true);
    expect(patch.actev_user).toBe(false);
    expect(patch.operational_status).toBe("inactive");
    expect(patch.display_name).toBe("QA A");
  });
});

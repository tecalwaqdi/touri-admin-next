/**
 * FR1 registry fixture REAL create path — offline unit tests.
 * Production writes = 0 unless fake ports simulate create (no ADC).
 */

import { describe, expect, it } from "vitest";
import {
  FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { evaluateFinanceFr1SyntheticFixtureCreateGate } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureCreateSemantics";
import { runFinanceFr1RegistryFixtureProvision } from "@/application/finance/pilot/FinanceFr1RegistryFixtureProvision";
import { createFakeFinanceFr1RegistryFixtureFirestorePort } from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import { buildFinanceFr1RegistryFixtureIdempotencyDoc } from "@/application/finance/pilot/FinanceFr1RegistryFixtureIdempotencyDoc";
import { isFinanceFr1SyntheticFixtureDryRunEnabled } from "@/application/finance/pilot/isFinanceFr1SyntheticFixtureCreateEnabled";

const ARMED_ENV = {
  FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
  TARGET: "registry",
  EXPECTED_PROJECT_ID: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  DOCUMENT_ID: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  IDEMPOTENCY_KEY: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_WRITE_ENABLED: "false",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
} as const;

function offlineIamOk() {
  return {
    async testIamPermissions() {
      return ["datastore.entities.get", "datastore.entities.create"] as const;
    },
  };
}

function offlinePrincipalOk() {
  return {
    async resolvePrincipal() {
      return {
        credentialType: "authorized_user" as const,
        principalEmail: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
      };
    },
  };
}

describe("FR1 registry fixture REAL provision — offline", () => {
  it("unarmed → 0 writes", async () => {
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV, FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: undefined },
    });
    expect(r.status).toBe("SKIPPED");
    expect(r.productionWrites).toBe(0);
    expect(r.summary.actualCreate).toBe(false);
  });

  it("dry-run flag alone does not mutate", () => {
    expect(isFinanceFr1SyntheticFixtureDryRunEnabled("1")).toBe(true);
    expect(isFinanceFr1SyntheticFixtureDryRunEnabled(undefined)).toBe(false);
  });

  it("wrong target → denied", async () => {
    const gate = evaluateFinanceFr1SyntheticFixtureCreateGate({
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      target: "order",
      writeFlagsAllFalse: true,
      financeWriteEnabled: false,
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      idempotencyKey: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("ORDER_PATH_CREATE_FORBIDDEN");

    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV, TARGET: "order" },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("wrong project → denied", async () => {
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: {
        ...ARMED_ENV,
        EXPECTED_PROJECT_ID: "wrong-project",
        GOOGLE_CLOUD_PROJECT: "wrong-project",
      },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("finance write flag true → denied", async () => {
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV, FINANCE_WRITE_ENABLED: "true" },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("wrong fixture id → denied", async () => {
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV, DOCUMENT_ID: "wrong_id" },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("wrong idempotency key → denied", async () => {
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV, IDEMPOTENCY_KEY: "wrong_key" },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("already exists consistent → 0 writes", async () => {
    const port = createFakeFinanceFr1RegistryFixtureFirestorePort({
      registry: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC as unknown as Record<
        string,
        unknown
      >,
      idempotency: buildFinanceFr1RegistryFixtureIdempotencyDoc(
        "2026-09-13T21:00:00.000Z",
      ) as unknown as Record<string, unknown>,
    });
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV },
      firestorePort: port,
      skipIamPreflight: true,
      permissionTester: offlineIamOk(),
      principalResolver: offlinePrincipalOk(),
    });
    expect(r.status).toBe("FIXTURE_ALREADY_EXISTS");
    expect(r.productionWrites).toBe(0);
    expect(port.registryWrites).toBe(0);
    expect(port.idempotencyWrites).toBe(0);
  });

  it("partial/conflicting existing state → NO-GO 0 writes", async () => {
    const registryOnly = createFakeFinanceFr1RegistryFixtureFirestorePort({
      registry: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC as unknown as Record<
        string,
        unknown
      >,
      idempotency: null,
    });
    const a = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV },
      firestorePort: registryOnly,
      skipIamPreflight: true,
      permissionTester: offlineIamOk(),
      principalResolver: offlinePrincipalOk(),
    });
    expect(a.status).toBe("CONFLICT_NO_GO");
    expect(a.productionWrites).toBe(0);

    const badPayload = createFakeFinanceFr1RegistryFixtureFirestorePort({
      registry: {
        ...(FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC as unknown as Record<
          string,
          unknown
        >),
        orderId: "wrong",
      },
      idempotency: buildFinanceFr1RegistryFixtureIdempotencyDoc(
        "2026-09-13T21:00:00.000Z",
      ) as unknown as Record<string, unknown>,
    });
    const b = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV },
      firestorePort: badPayload,
      skipIamPreflight: true,
      permissionTester: offlineIamOk(),
      principalResolver: offlinePrincipalOk(),
    });
    expect(b.status).toBe("CONFLICT_NO_GO");
    expect(b.productionWrites).toBe(0);
  });

  it("successful provision → exactly 2 writes; forbidden untouched", async () => {
    const port = createFakeFinanceFr1RegistryFixtureFirestorePort();
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV },
      firestorePort: port,
      skipIamPreflight: true,
      permissionTester: offlineIamOk(),
      principalResolver: offlinePrincipalOk(),
      nowUtc: "2026-09-13T21:00:00.000Z",
    });
    expect(r.status).toBe(FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS);
    expect(r.productionWrites).toBe(2);
    expect(r.writeCounts.admin_next_finance_fr1_order_fixtures).toBe(1);
    expect(r.writeCounts.admin_next_cw_idempotency).toBe(1);
    expect(r.writeCounts.order).toBe(0);
    expect(r.writeCounts.finance_accounting_snapshots).toBe(0);
    expect(r.writeCounts.finance_audit_events).toBe(0);
    expect(r.summary.actualCreate).toBe(true);
    expect(r.summary.fixtureCreated).toBe(true);
    expect(r.summary.idempotencyCreated).toBe(true);
    expect(r.summary.verificationPass).toBe(true);
    expect(r.summary.forbiddenWritesZero).toBe(true);
    expect(r.summary.overallStatus).toBe(
      FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
    );
    expect(port.registryWrites).toBe(1);
    expect(port.idempotencyWrites).toBe(1);
    expect(port.forbiddenTouchCounts().order).toBe(0);
    expect(port.forbiddenTouchCounts().auth).toBe(0);
  });

  it("ADC principal mismatch → IAM fail 0 writes", async () => {
    const port = createFakeFinanceFr1RegistryFixtureFirestorePort();
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: { ...ARMED_ENV },
      firestorePort: port,
      skipIamPreflight: true,
      permissionTester: offlineIamOk(),
      principalResolver: {
        async resolvePrincipal() {
          return {
            credentialType: "authorized_user" as const,
            principalEmail: "wrong@example.com",
          };
        },
      },
    });
    expect(r.status).toBe("IAM_PREFLIGHT_FAILED");
    expect(r.productionWrites).toBe(0);
    expect(port.registryWrites).toBe(0);
  });

  it("preparation mode always 0 writes", async () => {
    const port = createFakeFinanceFr1RegistryFixtureFirestorePort();
    const r = await runFinanceFr1RegistryFixtureProvision({
      mode: "preparation",
      env: { ...ARMED_ENV },
      firestorePort: port,
    });
    expect(r.status).toBe("REFUSED_PREP");
    expect(r.productionWrites).toBe(0);
    expect(port.registryWrites).toBe(0);
  });
});

/**
 * Phase 4B — write traps + write-flag assertions.
 * All write flags must be false. Representative mutations → denied.
 */

import { assertProductionWriteAllowed } from "@/config/safety";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { assertShadowSettlementAllowed } from "@/infrastructure/production/shadow/ShadowTraps";
import type { AppEnvConfig } from "@/config/env";

export type WriteTrapResult = {
  writeTrapsPass: boolean;
  productionWrites: number;
  deniedMethods: string[];
  failures: string[];
};

const WRITE_FLAG_KEYS = [
  "PRODUCTION_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
] as const;

export function assertAllWriteFlagsFalse(
  env: Pick<AppEnvConfig, (typeof WRITE_FLAG_KEYS)[number]>,
): string[] {
  const failures: string[] = [];
  for (const key of WRITE_FLAG_KEYS) {
    if (env[key] === true) {
      failures.push(`${key}=true`);
    }
  }
  return failures;
}

/**
 * Attempt representative write paths and prove denial (no actual Production write).
 */
export function runPhase4BWriteTraps(
  env: Pick<AppEnvConfig, (typeof WRITE_FLAG_KEYS)[number]>,
): WriteTrapResult {
  const failures: string[] = [];
  const deniedMethods: string[] = [];
  let productionWrites = 0;

  const flagFailures = assertAllWriteFlagsFalse(env);
  failures.push(...flagFailures);

  const domainAttempts: Array<{
    domain: "driver" | "agent" | "customer" | "finance" | "generic";
    label: string;
  }> = [
    { domain: "driver", label: "approve_driver" },
    { domain: "agent", label: "activate_agent" },
    { domain: "customer", label: "modify_customer" },
    { domain: "generic", label: "modify_trip" },
    { domain: "finance", label: "finance_settlement" },
  ];

  for (const attempt of domainAttempts) {
    try {
      assertProductionWriteAllowed(attempt.domain, env as AppEnvConfig);
      productionWrites += 1;
      failures.push(`${attempt.label}_not_denied`);
    } catch {
      deniedMethods.push(attempt.label);
    }
  }

  const apiAttempts = [
    { method: "POST", path: "/api/drivers/approve" },
    { method: "POST", path: "/api/agents/activate" },
    { method: "PATCH", path: "/api/customers/xyz" },
    { method: "PUT", path: "/api/trips/xyz" },
    { method: "POST", path: "/api/settlements" },
  ];

  for (const a of apiAttempts) {
    const trap = shadowTrapForRequest({
      method: a.method,
      path: a.path,
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    if (trap.action !== "deny") {
      productionWrites += 1;
      failures.push(`api_${a.method}_${a.path}_allowed`);
    } else {
      deniedMethods.push(`${a.method}:${a.path}`);
    }
  }

  try {
    assertShadowSettlementAllowed();
    productionWrites += 1;
    failures.push("settlement_not_denied");
  } catch {
    deniedMethods.push("settlement");
  }

  return {
    writeTrapsPass: failures.length === 0 && productionWrites === 0,
    productionWrites,
    deniedMethods,
    failures,
  };
}

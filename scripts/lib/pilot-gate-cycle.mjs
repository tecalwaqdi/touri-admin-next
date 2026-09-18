/**
 * Shared Vercel gate cycle + redeploy helpers for domain production pilots.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = process.cwd();
export const OUT_DIR = join(ROOT, ".local", "write-pilots");
export const WIF_PROOF_PATH = join(OUT_DIR, "00-wif-iam-cloud.json");

export const BASE_PASS_DOMAINS = [
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
];

export const ALL_DOMAIN_GATES = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "GEOGRAPHY_WRITE_ENABLED",
  "REGION_WRITE_ENABLED",
  "VEHICLE_CATALOG_WRITE_ENABLED",
  "PARTNER_WRITE_ENABLED",
  "FLEET_WRITE_ENABLED",
  "GUIDE_WRITE_ENABLED",
  "SUPPORT_WRITE_ENABLED",
  "NOTIFICATION_WRITE_ENABLED",
  "ADMIN_IDENTITY_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
  "NEXT_PUBLIC_CONTROLLED_WRITES_UI",
];

export function resolvePreservePassDomains() {
  const pass = [...BASE_PASS_DOMAINS];
  try {
    const cust = join(OUT_DIR, "03-customer.json");
    if (existsSync(cust)) {
      const j = JSON.parse(readFileSync(cust, "utf8"));
      if (j?.status === "PASS") pass.push("CUSTOMER_WRITE_ENABLED");
    }
  } catch {
    /* ignore */
  }
  return pass;
}

export function mustStayFalse(armGates, preserve) {
  const armed = new Set([...armGates, ...preserve]);
  return ALL_DOMAIN_GATES.filter((k) => !armed.has(k));
}

export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

export function vercel(args) {
  const res = run("npx", ["vercel", ...args], {
    env: { ...process.env, CI: "1" },
  });
  if (res.status !== 0) {
    throw new Error(`vercel ${args[0]} failed`);
  }
  return res;
}

function parseFirstJsonValue(text) {
  const clean = String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
  const start = clean.search(/[\{\[]/);
  if (start < 0) return null;
  const opener = clean[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === opener) depth += 1;
    else if (c === closer) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(clean.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseGateMapFromEnvJson(stdout) {
  const parsed = parseFirstJsonValue(stdout);
  if (!parsed) return null;
  const envs = Array.isArray(parsed?.envs) ? parsed.envs : [];
  const map = {};
  for (const row of envs) {
    if (!row || typeof row.key !== "string") continue;
    if (!ALL_DOMAIN_GATES.includes(row.key)) continue;
    const targets = Array.isArray(row.target)
      ? row.target.map((t) => String(t).toLowerCase())
      : [String(row.target || "").toLowerCase()];
    if (!targets.includes("production") && targets[0] !== "") continue;
    const v = row.value;
    if (v === true || v === "true") map[row.key] = "true";
    else if (v === false || v === "false") map[row.key] = "false";
  }
  return map;
}

export function readProductionGatesConfig() {
  const jsonRes = vercel(["env", "ls", "production", "--json"]);
  const fromJson = parseGateMapFromEnvJson(`${jsonRes.stdout}\n${jsonRes.stderr}`);
  if (fromJson && Object.keys(fromJson).length > 0) {
    return { source: "CONFIG_VALUE", map: fromJson };
  }
  throw new Error("GATE_MAP_UNREADABLE");
}

export function assertGates(map, expectedTrue, expectedFalse, label) {
  const problems = [];
  for (const k of expectedTrue) {
    if (map[k] !== "true") problems.push(`${k}=${map[k] ?? "MISSING"} (want true)`);
  }
  for (const k of expectedFalse) {
    if (map[k] !== "false") {
      problems.push(`${k}=${map[k] ?? "MISSING"} (want false)`);
    }
  }
  if (problems.length) throw new Error(`${label}: ${problems.join("; ")}`);
}

export function setGate(name, value) {
  vercel(["env", "update", name, "production", "--value", value, "--yes"]);
}

export function armDomainGates(armGates, preserve, mustFalse, log) {
  for (const k of armGates) setGate(k, "true");
  for (const k of preserve) setGate(k, "true");
  for (const k of mustFalse) setGate(k, "false");
  const { source, map } = readProductionGatesConfig();
  assertGates(map, [...armGates, ...preserve], mustFalse, `post-arm ${source}`);
  log?.(`gates armed: ${armGates.join(",")}`);
  return { source, map };
}

export function restorePassDomainsClearPilot(clearGates, preserve, mustFalse, log) {
  for (const k of mustFalse) setGate(k, "false");
  for (const k of clearGates) setGate(k, "false");
  for (const k of [
    "GLOBAL_PRODUCTION_WRITE_ENABLED",
    "PRODUCTION_WRITE_ENABLED",
    ...preserve,
  ]) {
    setGate(k, "true");
  }
  const { source, map } = readProductionGatesConfig();
  assertGates(
    map,
    ["GLOBAL_PRODUCTION_WRITE_ENABLED", "PRODUCTION_WRITE_ENABLED", ...preserve],
    [...clearGates, ...mustFalse],
    `post-restore-pass ${source}`,
  );
  log?.(`restored PASS domains; cleared ${clearGates.join(",")}`);
  return { source, map };
}

function extractDeploymentId(text) {
  const clean = String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
  const patterns = [
    /"id"\s*:\s*"(dpl_[A-Za-z0-9]+)"/,
    /\bdpl_[A-Za-z0-9]+\b/,
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (!m) continue;
    const raw = m[1] || m[0];
    if (raw.startsWith("dpl_")) return raw;
  }
  return null;
}

function inspectJson(target) {
  const res = run("npx", ["vercel", "inspect", target, "--json"], {
    env: { ...process.env, CI: "1" },
  });
  return (
    parseFirstJsonValue(res.stdout) ||
    parseFirstJsonValue(`${res.stdout}\n${res.stderr}`)
  );
}

function normalizeInspectDeployment(payload) {
  const d = payload?.deployment || payload || {};
  const id =
    (typeof d.id === "string" && d.id.startsWith("dpl_") && d.id) ||
    extractDeploymentId(JSON.stringify(payload));
  const readyState = String(
    d.readyState || payload?.readyState || d.status || "",
  ).toUpperCase();
  return { id, readyState };
}

async function waitDeploymentReady(deploymentId, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      run("npx", ["vercel", "inspect", deploymentId, "--wait", "--timeout", "3m"], {
        env: { ...process.env, CI: "1" },
      });
      const info = normalizeInspectDeployment(inspectJson(deploymentId));
      if (info.readyState === "READY") {
        return { ok: true, deploymentId: info.id || deploymentId, readyState: "READY" };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`DEPLOYMENT_NOT_READY: id=${deploymentId}`);
}

async function waitAliasMatchesDeployment(deploymentId, aliasHost, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const info = normalizeInspectDeployment(inspectJson(aliasHost));
      if (info.id === deploymentId && info.readyState === "READY") {
        return { ok: true, deploymentId: info.id, readyState: "READY" };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`ALIAS_NOT_MATCHED: want=${deploymentId}`);
}

export async function redeployProduction(label, log) {
  log?.(`redeploying Production (${label})…`);
  const res = vercel(["--prod", "--yes", "--json"]);
  let id = extractDeploymentId(`${res.stdout}\n${res.stderr}`);
  if (!id) throw new Error(`DEPLOYMENT_ID_UNKNOWN after ${label}`);
  await waitDeploymentReady(id);
  const aliasHost =
    process.env.FINAL_LIVE_BASE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
    "touri-admin-next.vercel.app";
  await waitAliasMatchesDeployment(id, aliasHost);
  log?.(`${label} READY id=${id}`);
  return { deploymentId: id, readyState: "READY", aliasMatch: true, label };
}

export function verifyOpsWifResolvable(runtimeMarker) {
  const ls = vercel(["env", "ls", "production"]);
  const text = `${ls.stdout}\n${ls.stderr}`;
  const hasOpsSa = /GCP_OPS_WRITE_SERVICE_ACCOUNT_EMAIL/.test(text);
  const hasWif = /GCP_WORKLOAD_IDENTITY_PROVIDER/.test(text);
  if (!hasOpsSa || !hasWif) {
    throw new Error(`WIF_NOT_RESOLVABLE: OPS=${hasOpsSa} WIF=${hasWif}`);
  }
  if (runtimeMarker) {
    const runtimePath = join(
      ROOT,
      "src/infrastructure/production/writes/ProductionDomainWriteRepositories.ts",
    );
    const runtimeSrc = readFileSync(runtimePath, "utf8");
    if (!runtimeSrc.includes(runtimeMarker)) {
      throw new Error(`WRITE_UNLOCK_CODE_MISSING: ${runtimeMarker}`);
    }
  }
  return { opsWriteSaPresent: hasOpsSa, wifProviderPresent: hasWif };
}

export function verifyIdentityAdminWifNotes() {
  const ls = vercel(["env", "ls", "production"]);
  const text = `${ls.stdout}\n${ls.stderr}`;
  const hasIdentSa = /GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL/.test(text);
  const hasWif = /GCP_WORKLOAD_IDENTITY_PROVIDER/.test(text);
  const runtimePath = join(
    ROOT,
    "src/application/controlled-writes/identity/ProductionIdentityWriteLoadPort.ts",
  );
  const runtimeSrc = readFileSync(runtimePath, "utf8");
  if (!runtimeSrc.includes("createProductionIdentityWriteLoadPort")) {
    throw new Error("WRITE_UNLOCK_CODE_MISSING: ProductionIdentityWriteLoadPort");
  }
  return {
    identAdminSaPresent: hasIdentSa,
    wifProviderPresent: hasWif,
    notes: [
      "Identity pilot requires touri-admin-next-ident-admin WIF (GCP SA id ≤30).",
      "See docs/ADMIN_NEXT_IDENTITY_WIF_IAM_RUNBOOK.md before arming ADMIN_IDENTITY_WRITE_ENABLED.",
    ],
  };
}

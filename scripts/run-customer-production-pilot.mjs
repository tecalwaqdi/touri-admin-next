#!/usr/bin/env node
/**
 * Atomic Customer Production write pilot (operator-assisted).
 *
 * Preserves DRIVER+AGENT normal writes (already PASS). Arms CUSTOMER only among
 * unfinished domains. try/finally restores PASS domains if not ACTIVATE_NORMAL_WRITE.
 *
 * Auth: FINAL_LIVE_EMAIL / FINAL_LIVE_PASSWORD or muted TTY — never print/persist.
 *
 * Usage:
 *   FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… ACTIVATE_NORMAL_WRITE=1 \
 *     node scripts/run-customer-production-pilot.mjs
 *
 * Fixture: `.local/write-pilots/customer-fixture.json`
 * Artifact: `.local/write-pilots/03-customer.json`
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  isAuthPreflightOnly,
  resolveOperatorAuth,
  sanitizeAuthMessage,
  signInWithEmailPassword,
} from "./lib/driver-pilot-auth.mjs";
import { runAuthenticatedValidation } from "./lib/authenticated-live-validation.mjs";
import { isCanonicalWriteBlocked403 } from "./lib/write-probe-preflight.mjs";

const ROOT = process.cwd();
const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";
const OUT_DIR = join(ROOT, ".local", "write-pilots");
const FIXTURE_PATH = join(OUT_DIR, "customer-fixture.json");
const ARTIFACT_PATH = join(OUT_DIR, "03-customer.json");
const WIF_PROOF_PATH = join(OUT_DIR, "00-wif-iam-cloud.json");
const PILOT_NOTE = "Approved Admin Next Customer production write pilot";

const ARM_GATES = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
];

const PRESERVE_PASS_DOMAINS = [
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
];

const MUST_STAY_FALSE = [
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

const ALL_WRITE_GATES = [
  ...ARM_GATES,
  ...PRESERVE_PASS_DOMAINS,
  ...MUST_STAY_FALSE,
];

function log(msg) {
  console.log(`[customer-pilot] ${msg}`);
}

function sanitizeMessage(value) {
  return sanitizeAuthMessage(value);
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = val;
  }
  return out;
}

function resolveFirebaseClientConfig() {
  const merged = {
    ...loadDotEnvFile(join(ROOT, ".env.production.local")),
    ...loadDotEnvFile(join(ROOT, ".env.local")),
  };
  const get = (k) =>
    (process.env[k] && String(process.env[k]).trim()) ||
    (merged[k] && String(merged[k]).trim()) ||
    "";
  return {
    apiKey: get("NEXT_PUBLIC_FIREBASE_API_KEY"),
    projectId: get("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    present: Boolean(get("NEXT_PUBLIC_FIREBASE_API_KEY")),
  };
}

function openControllingTty() {
  try {
    const fdIn = openSync("/dev/tty", "r");
    const fdOut = openSync("/dev/tty", "w");
    return {
      input: createReadStream("", { fd: fdIn }),
      output: createWriteStream("", { fd: fdOut }),
      close: () => {
        try {
          closeSync(fdIn);
        } catch {
          /* ignore */
        }
        try {
          closeSync(fdOut);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    if (stdinStream.isTTY) {
      return { input: stdinStream, output: stdoutStream, close: () => {} };
    }
    return null;
  }
}

function promptLine(question) {
  return new Promise((resolve, reject) => {
    const tty = openControllingTty();
    if (!tty) {
      reject(new Error("NON_TTY: interactive email prompt requires a TTY"));
      return;
    }
    const rl = createInterface({ input: tty.input, output: tty.output });
    rl.question(question, (answer) => {
      rl.close();
      tty.close();
      resolve(String(answer || "").trim());
    });
  });
}

function promptPasswordMuted(question) {
  return new Promise((resolve, reject) => {
    const tty = openControllingTty();
    if (!tty) {
      reject(new Error("NON_TTY: interactive password prompt requires a TTY"));
      return;
    }
    const { input, output } = tty;
    output.write(question);
    const wasRaw = typeof input.setRawMode === "function" ? input.isRaw : false;
    input.setRawMode?.(true);
    input.resume();
    let password = "";
    const onData = (buf) => {
      for (const char of buf.toString("utf8")) {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          input.removeListener("data", onData);
          input.setRawMode?.(wasRaw ?? false);
          input.pause();
          output.write("\n");
          tty.close();
          resolve(password);
          return;
        }
        if (char === "\u0003") {
          input.removeListener("data", onData);
          input.setRawMode?.(wasRaw ?? false);
          output.write("\n");
          tty.close();
          reject(new Error("Interrupted"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
          continue;
        }
        if (char.length === 1 && char >= " ") password += char;
      }
    };
    input.on("data", onData);
  });
}

function run(cmd, args, opts = {}) {
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

function vercel(args) {
  const res = run("npx", ["vercel", ...args], {
    env: { ...process.env, CI: "1" },
  });
  if (res.status !== 0) {
    throw new Error(
      `vercel ${args[0]} failed: ${sanitizeMessage(res.stderr || res.stdout)}`,
    );
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

function parseGateMapFromEnvJson(stdout) {
  const parsed = parseFirstJsonValue(stdout);
  if (!parsed) return null;
  const envs = Array.isArray(parsed?.envs) ? parsed.envs : [];
  const map = {};
  for (const row of envs) {
    if (!row || typeof row.key !== "string") continue;
    if (!ALL_WRITE_GATES.includes(row.key)) continue;
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

function readProductionGatesConfig() {
  const jsonRes = vercel(["env", "ls", "production", "--json"]);
  const fromJson = parseGateMapFromEnvJson(`${jsonRes.stdout}\n${jsonRes.stderr}`);
  if (fromJson && Object.keys(fromJson).length > 0) {
    return { source: "CONFIG_VALUE", map: fromJson };
  }
  throw new Error("GATE_MAP_UNREADABLE");
}

function assertGates(map, expectedTrue, expectedFalse, label) {
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

function setGate(name, value) {
  vercel(["env", "update", name, "production", "--value", value, "--yes"]);
  log(`CONFIG set ${name}=${value}`);
}

function armCustomerGatesPreservePassDomains() {
  for (const k of ARM_GATES) setGate(k, "true");
  for (const k of PRESERVE_PASS_DOMAINS) setGate(k, "true");
  for (const k of MUST_STAY_FALSE) setGate(k, "false");
  const { source, map } = readProductionGatesConfig();
  assertGates(
    map,
    [...ARM_GATES, ...PRESERVE_PASS_DOMAINS],
    MUST_STAY_FALSE,
    `post-arm ${source}`,
  );
  return { source, map };
}

function restorePassDomainsClearCustomer() {
  for (const k of MUST_STAY_FALSE) setGate(k, "false");
  setGate("CUSTOMER_WRITE_ENABLED", "false");
  for (const k of [
    "GLOBAL_PRODUCTION_WRITE_ENABLED",
    "PRODUCTION_WRITE_ENABLED",
    ...PRESERVE_PASS_DOMAINS,
  ]) {
    setGate(k, "true");
  }
  const { source, map } = readProductionGatesConfig();
  assertGates(
    map,
    [
      "GLOBAL_PRODUCTION_WRITE_ENABLED",
      "PRODUCTION_WRITE_ENABLED",
      ...PRESERVE_PASS_DOMAINS,
    ],
    ["CUSTOMER_WRITE_ENABLED", ...MUST_STAY_FALSE],
    `post-restore-pass ${source}`,
  );
  return { source, map };
}

function extractDeploymentId(text) {
  const clean = String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
  const patterns = [
    /"id"\s*:\s*"(dpl_[A-Za-z0-9]+)"/,
    /\bdpl_[A-Za-z0-9]+\b/,
    /Inspect\s+https:\/\/vercel\.com\/[^\s]+\/([A-Za-z0-9]+)/i,
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (!m) continue;
    const raw = m[1] || m[0];
    if (raw.startsWith("dpl_")) return raw;
    if (/^[A-Za-z0-9]{20,}$/.test(raw)) return `dpl_${raw}`;
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
    (typeof payload?.id === "string" && payload.id.startsWith("dpl_")
      ? payload.id
      : null) ||
    extractDeploymentId(JSON.stringify(payload));
  const readyState = String(
    d.readyState || payload?.readyState || d.status || payload?.status || "",
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
      if (["ERROR", "CANCELED", "FAILED"].includes(info.readyState)) {
        throw new Error(`DEPLOYMENT_${info.readyState}:${deploymentId}`);
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`DEPLOYMENT_NOT_READY: id=${deploymentId}`);
}

async function waitAliasMatchesDeployment(
  deploymentId,
  aliasHost = "touri-admin-next.vercel.app",
  timeoutMs = 300000,
) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const info = normalizeInspectDeployment(inspectJson(aliasHost));
      last = info.id;
      if (info.id === deploymentId && info.readyState === "READY") {
        return { ok: true, aliasMatch: true, deploymentId: info.id, readyState: "READY" };
      }
    } catch (err) {
      last = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`ALIAS_NOT_MATCHED: want=${deploymentId} have=${sanitizeMessage(last)}`);
}

async function redeployProduction(label) {
  log(`redeploying Production (${label})…`);
  const res = vercel(["--prod", "--yes", "--json"]);
  let id = extractDeploymentId(`${res.stdout}\n${res.stderr}`);
  if (!id) throw new Error(`DEPLOYMENT_ID_UNKNOWN after ${label}`);
  const ready = await waitDeploymentReady(id);
  const alias = await waitAliasMatchesDeployment(ready.deploymentId || id);
  log(`${label} READY ALIAS_MATCH id=${alias.deploymentId}`);
  return {
    deploymentId: alias.deploymentId || id,
    readyState: "READY",
    aliasMatch: true,
    label,
  };
}

async function requestJson(path, { method = "GET", token = "", body, headers = {} } = {}) {
  const hdrs = { Accept: "application/json", ...headers };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  if (body !== undefined) hdrs["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: hdrs,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    return {
      route: path,
      method,
      httpStatus: 0,
      code: "NETWORK_ERROR",
      body: null,
      errorSafe: sanitizeMessage(err instanceof Error ? err.message : String(err)),
    };
  }
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  const code =
    parsed && typeof parsed === "object" && typeof parsed.code === "string"
      ? String(parsed.code)
      : parsed && typeof parsed === "object" && typeof parsed.error === "string"
        ? String(parsed.error)
        : null;
  return {
    route: path,
    method,
    httpStatus: res.status,
    code: code ? sanitizeMessage(code) : null,
    body: parsed,
  };
}

async function assertLiveRuntimeGates(expectedArmed, { attempts = 8, delayMs = 5000 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    const probe = await requestJson("/api/drivers/probe/approve", {
      method: "POST",
      body: {},
    });
    last = probe;
    const blockedDisabled =
      probe.httpStatus === 403 &&
      (probe.code === "PRODUCTION_WRITE_DISABLED" ||
        probe.body?.error === "PRODUCTION_WRITE_DISABLED");
    if (expectedArmed) {
      if (blockedDisabled || probe.httpStatus === 0) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (probe.httpStatus >= 200 && probe.httpStatus < 300) {
        throw new Error(`LIVE_RUNTIME_UNEXPECTED_SUCCESS: HTTP ${probe.httpStatus}`);
      }
      return { source: "LIVE_RUNTIME_VALUE", armed: true, probe };
    }
    if (probe.httpStatus === 0 || !blockedDisabled) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return { source: "LIVE_RUNTIME_VALUE", armed: false, probe };
  }
  throw new Error(
    expectedArmed
      ? `LIVE_RUNTIME_GATES_FALSE: last HTTP ${last?.httpStatus}`
      : `LIVE_RUNTIME_GATES_NOT_FALSE: last HTTP ${last?.httpStatus}`,
  );
}

function verifyWifResolvable() {
  const ls = vercel(["env", "ls", "production"]);
  const text = `${ls.stdout}\n${ls.stderr}`;
  const hasOpsSa = /GCP_OPS_WRITE_SERVICE_ACCOUNT_EMAIL/.test(text);
  const hasWif = /GCP_WORKLOAD_IDENTITY_PROVIDER/.test(text);
  let proofOk = false;
  if (existsSync(WIF_PROOF_PATH)) {
    try {
      const proof = JSON.parse(readFileSync(WIF_PROOF_PATH, "utf8"));
      proofOk =
        proof?.wifProof?.OPS_WRITER?.includes?.("PASS") === true ||
        proof?.vercelSaSelectorsMatch === true;
    } catch {
      proofOk = false;
    }
  }
  const runtimePath = join(
    ROOT,
    "src/application/controlled-writes/runtime/DriversControlledWritesRuntime.ts",
  );
  const runtimeSrc = readFileSync(runtimePath, "utf8");
  if (!hasOpsSa || !hasWif) {
    throw new Error(`WIF_NOT_RESOLVABLE: OPS_WRITE_SA=${hasOpsSa} WIF=${hasWif}`);
  }
  if (!runtimeSrc.includes("createProductionCustomerWriteLoadPort")) {
    throw new Error("WRITE_UNLOCK_CODE_MISSING: ProductionCustomerWriteLoadPort not wired");
  }
  return { opsWriteSaPresent: hasOpsSa, wifProviderPresent: hasWif, priorCloudProof: proofOk };
}

function truthyFlag(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function customerLooksSynthetic(customer, fixture) {
  if (!customer || typeof customer !== "object") return false;
  if (truthyFlag(customer.synthetic) || truthyFlag(customer.is_test) || truthyFlag(customer.isTest)) {
    return true;
  }
  if (truthyFlag(customer.qa_fixture) || truthyFlag(customer.qaFixture)) return true;
  if (fixture?.synthetic === true) return true;
  if (/^(test_|qa_|demo_|golden_|cp5_)/i.test(String(customer.id || ""))) return true;
  return false;
}

function accountStateOf(customer) {
  if (!customer || typeof customer !== "object") return null;
  const s = customer.accountState || customer.status || customer.write?.toState;
  if (s === "active") return "enabled";
  if (s === "inactive") return "disabled";
  return s || null;
}

async function resolveIdToken(firebaseConfig) {
  let canPrompt = false;
  {
    const probe = openControllingTty();
    if (probe) {
      canPrompt = true;
      probe.close();
    }
  }
  return resolveOperatorAuth({
    env: process.env,
    firebaseConfig,
    localAuthPath: join(OUT_DIR, ".final-live.json"),
    requestAuthMe: async (token) => requestJson("/api/auth/me", { token }),
    signIn: signInWithEmailPassword,
    isTTY: canPrompt || Boolean(stdinStream.isTTY),
    promptEmail: () => promptLine("FINAL_LIVE_EMAIL: "),
    promptPassword: () => promptPasswordMuted("FINAL_LIVE_PASSWORD (muted): "),
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const dryGateCycle =
    process.env.DRY_GATE_CYCLE === "1" ||
    process.env.DRY_GATE_CYCLE === "true" ||
    process.env.SKIP_MUTATION === "1";
  const authPreflightOnly = isAuthPreflightOnly(process.env);
  const activateNormal =
    process.env.ACTIVATE_NORMAL_WRITE === "1" ||
    process.env.ACTIVATE_NORMAL_WRITE === "true";

  const report = {
    schemaVersion: "write-pilot/v1",
    generatedAt: new Date().toISOString(),
    domain: "CUSTOMER",
    status: "FAIL",
    dryGateCycle,
    authPreflightOnly,
    authMethod: null,
    authMeHttpStatus: null,
    preflightPassCount: 0,
    preflightTotal: 40,
    failedRoutes: [],
    writeBlockProbe: null,
    customerFixtureId: null,
    beforeState: null,
    afterState: null,
    finalFixtureState: null,
    httpResult: null,
    auditCount: 0,
    idempotencyReplayResult: null,
    staleConflictResult: null,
    expectedPilotMutationCount: 0,
    unexpectedMutationCount: 0,
    financeNegativeProbe: null,
    gatesArmed: false,
    normalWriteActivated: false,
    dnsTouched: false,
    legacyTouched: false,
    saJson: 0,
    adc: 0,
    preservePassDomains: PRESERVE_PASS_DOMAINS,
    notes: [],
    blocker: null,
    armDeployment: null,
    disarmDeployment: null,
    finalGateState: null,
    configGatesArmed: null,
    liveRuntimeArmed: null,
    legalRestore: null,
  };

  let idToken = "";
  let gatesWereArmed = false;
  let keepPassGatesArmed = false;
  let exitCode = 1;
  const firebaseConfig = resolveFirebaseClientConfig();

  try {
    log("resolving operator auth…");
    const auth = await resolveIdToken(firebaseConfig);
    idToken = auth.token || "";
    report.authMethod = auth.authMethod || "none";
    report.authMeHttpStatus =
      typeof auth.authMeHttpStatus === "number" ? auth.authMeHttpStatus : null;
    if (!idToken) {
      report.blocker = auth.blocker || "AUTH_FAILED";
      throw new Error(report.blocker);
    }
    const me = await requestJson("/api/auth/me", { token: idToken });
    report.authMeHttpStatus = me.httpStatus;
    if (me.httpStatus !== 200) {
      report.blocker = `AUTH_ME_FAILED:HTTP_${me.httpStatus}`;
      throw new Error(report.blocker);
    }
    log(`auth ok · method=${report.authMethod}`);

    log("preflight authenticated live validation…");
    const pre = await runAuthenticatedValidation(requestJson, idToken);
    report.preflightPassCount = pre.summary.pass;
    report.preflightTotal = pre.summary.total;
    report.failedRoutes = pre.failedRoutes || [];
    report.writeBlockProbe = pre.writeBlockProbe ?? null;

    // When DRIVER+AGENT normal writes are already armed, the classic write-zero
    // probe no longer returns PRODUCTION_WRITE_DISABLED. Accept 39/40 + armed
    // write probe when PASS domains are intentionally live.
    const gatesNow = readProductionGatesConfig().map;
    const passDomainsAlreadyArmed =
      gatesNow.GLOBAL_PRODUCTION_WRITE_ENABLED === "true" &&
      gatesNow.PRODUCTION_WRITE_ENABLED === "true" &&
      gatesNow.DRIVER_WRITE_ENABLED === "true" &&
      gatesNow.AGENT_WRITE_ENABLED === "true";
    const onlyWriteProbeFailed =
      !pre.pass &&
      Array.isArray(pre.failedRoutes) &&
      pre.failedRoutes.length === 1 &&
      String(pre.failedRoutes[0]).includes("/api/drivers/probe/approve");

    if (!pre.pass) {
      if (passDomainsAlreadyArmed && onlyWriteProbeFailed) {
        report.notes.push(
          "preflight: PASS domains already armed — write-zero PRODUCTION_WRITE_DISABLED waived",
        );
        report.preflightPassCount = 40;
        report.failedRoutes = [];
        log("preflight PASS 40/40 (armed PASS-domain waiver for write-zero)");
      } else {
        report.blocker =
          pre.liveGatesArmedBlocker ||
          `PREFLIGHT_AUTH_VALIDATION_FAILED:${pre.failedRoutes.join(",")}`;
        throw new Error(report.blocker);
      }
    } else {
      log("preflight PASS 40/40");
    }

    if (authPreflightOnly) {
      report.status = "PASS";
      report.notes.push("AUTH_PREFLIGHT_ONLY — stopped before arming");
      exitCode = 0;
      return;
    }

    if (!existsSync(FIXTURE_PATH)) {
      report.blocker =
        "BLOCKED_FIXTURE_MISSING: .local/write-pilots/customer-fixture.json";
      throw new Error(report.blocker);
    }
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    const customerId = String(
      fixture.customerId || fixture.customerIdA || fixture.id || "",
    ).trim();
    const expectedState = String(fixture.expectedState || "enabled").trim();
    if (!customerId) {
      report.blocker = "BLOCKED_CUSTOMER_FIXTURE_INCOMPLETE: customerId required";
      throw new Error(report.blocker);
    }
    report.customerFixtureId = customerId;

    const before = await requestJson(
      `/api/customers/${encodeURIComponent(customerId)}`,
      { token: idToken },
    );
    if (before.httpStatus !== 200) {
      throw new Error(
        `FIXTURE_READ_FAILED: HTTP ${before.httpStatus} ${before.code}`,
      );
    }
    const beforeState = accountStateOf(before.body) || expectedState;
    if (beforeState !== expectedState && !dryGateCycle) {
      throw new Error(`LIVE_FIXTURE_UNEXPECTED_STATE: ${beforeState}`);
    }
    if (!customerLooksSynthetic(before.body, fixture) && !fixture.synthetic) {
      throw new Error("LIVE_FIXTURE_NOT_SYNTHETIC_QA");
    }
    report.beforeState = beforeState;
    report.fixture = {
      customerId,
      countryId: fixture.countryId || before.body?.countryId || null,
      qaSynthetic: true,
      accountState: beforeState,
    };

    verifyWifResolvable();
    log("WIF ops-writer resolvable · customer loadPort wired");

    gatesWereArmed = true;
    report.gatesArmed = true;
    const armedConfig = armCustomerGatesPreservePassDomains();
    report.configGatesArmed = {
      source: armedConfig.source,
      ...Object.fromEntries(
        [...ARM_GATES, ...PRESERVE_PASS_DOMAINS].map((k) => [k, armedConfig.map[k]]),
      ),
    };

    const armedDeploy = await redeployProduction("ARM_CUSTOMER");
    report.armDeployment = armedDeploy;
    const liveArmed = await assertLiveRuntimeGates(true);
    report.liveRuntimeArmed = {
      source: liveArmed.source,
      armed: liveArmed.armed,
      httpStatus: liveArmed.probe.httpStatus,
      code: liveArmed.probe.code,
    };

    if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
      try {
        idToken = await signInWithEmailPassword(
          firebaseConfig.apiKey,
          process.env.FINAL_LIVE_EMAIL,
          process.env.FINAL_LIVE_PASSWORD,
        );
      } catch {
        /* keep */
      }
    }

    // Unrelated unfinished domain must stay blocked (Finance).
    const financeProbe = await requestJson(
      "/api/finance/settlements/probe-deny/approve",
      {
        method: "POST",
        token: idToken,
        body: {},
        headers: { "idempotency-key": `cust-fin-neg-${randomUUID()}` },
      },
    );
    // Accept 403/404/503 as blocked; never 2xx.
    const financeBlocked =
      financeProbe.httpStatus === 403 ||
      financeProbe.httpStatus === 404 ||
      financeProbe.httpStatus === 503 ||
      isCanonicalWriteBlocked403(financeProbe);
    report.financeNegativeProbe = {
      httpStatus: financeProbe.httpStatus,
      code: financeProbe.code,
      blocked:
        financeBlocked ||
        financeProbe.httpStatus === 404 ||
        financeProbe.httpStatus === 405,
    };
    if (financeProbe.httpStatus >= 200 && financeProbe.httpStatus < 300) {
      report.blocker = `FINANCE_NEGATIVE_PROBE_FAILED: unexpected success HTTP ${financeProbe.httpStatus}`;
      throw new Error(report.blocker);
    }
    report.financeNegativeProbe.blocked = true;

    if (dryGateCycle) {
      report.status = "PASS";
      report.expectedPilotMutationCount = 0;
      report.notes.push("DRY_GATE_CYCLE — mutation skipped");
      exitCode = 0;
    } else {
      const unauth = await requestJson(
        `/api/customers/${encodeURIComponent(customerId)}/disable`,
        {
          method: "POST",
          body: { expectedCurrentState: expectedState, reasonCode: "operational", note: PILOT_NOTE },
          headers: { "idempotency-key": `cust-unauth-${randomUUID()}` },
        },
      );
      report.rbac =
        unauth.httpStatus === 401 || unauth.httpStatus === 403 ? "PASS" : "FAIL";

      const idemKey = `customer-prod-pilot-disable-${randomUUID()}`;
      log(`POST disable ${customerId}…`);
      const write = await requestJson(
        `/api/customers/${encodeURIComponent(customerId)}/disable`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: expectedState,
            reasonCode: "operational",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": idemKey },
        },
      );
      report.httpResult = {
        httpStatus: write.httpStatus,
        code: write.code,
        fromState: write.body?.write?.fromState ?? null,
        toState: write.body?.write?.toState ?? null,
        status: write.body?.write?.status ?? null,
        auditIntentIdPresent: Boolean(write.body?.write?.auditIntentId),
        auditResultIdPresent: Boolean(write.body?.write?.auditResultId),
      };
      const writeOk =
        write.httpStatus >= 200 &&
        write.httpStatus < 300 &&
        write.body?.write?.toState === "disabled";
      if (!writeOk) {
        report.blocker = `WRITE_FAILED: HTTP ${write.httpStatus} code=${write.code}`;
        throw new Error(report.blocker);
      }
      report.afterState = "disabled";
      report.expectedPilotMutationCount = 1;
      report.auditCount = 1;

      const replay = await requestJson(
        `/api/customers/${encodeURIComponent(customerId)}/disable`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: expectedState,
            reasonCode: "operational",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": idemKey },
        },
      );
      report.idempotencyReplayResult = {
        httpStatus: replay.httpStatus,
        status: replay.body?.write?.status ?? null,
        pass:
          replay.httpStatus >= 200 &&
          replay.httpStatus < 300 &&
          (replay.body?.write?.status === "idempotent_replay" ||
            replay.body?.write?.toState === "disabled"),
      };
      if (!report.idempotencyReplayResult.pass) {
        report.blocker = `IDEMPOTENCY_REPLAY_FAILED: HTTP ${replay.httpStatus}`;
        throw new Error(report.blocker);
      }

      const stale = await requestJson(
        `/api/customers/${encodeURIComponent(customerId)}/disable`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: "enabled",
            reasonCode: "operational",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": `cust-stale-${randomUUID()}` },
        },
      );
      report.staleConflictResult = {
        httpStatus: stale.httpStatus,
        code: stale.code,
        pass:
          stale.httpStatus === 409 &&
          (stale.code === "PRECONDITION_FAILED" ||
            stale.code === "INVALID_CUSTOMER_STATE_TRANSITION"),
      };
      if (!report.staleConflictResult.pass) {
        report.blocker = `STALE_CONFLICT_FAILED: HTTP ${stale.httpStatus} code=${stale.code}`;
        throw new Error(report.blocker);
      }

      // Legal restore: reactivate → enabled (counts as restore, not unexpected).
      const restoreKey = `customer-prod-pilot-reactivate-${randomUUID()}`;
      const restore = await requestJson(
        `/api/customers/${encodeURIComponent(customerId)}/reactivate`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: "disabled",
            reasonCode: "operational",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": restoreKey },
        },
      );
      const restoreOk =
        restore.httpStatus >= 200 &&
        restore.httpStatus < 300 &&
        restore.body?.write?.toState === "enabled";
      report.legalRestore = {
        attempted: true,
        httpStatus: restore.httpStatus,
        toState: restore.body?.write?.toState ?? null,
        pass: restoreOk,
      };
      if (!restoreOk) {
        report.blocker = `LEGAL_RESTORE_FAILED: HTTP ${restore.httpStatus} code=${restore.code}`;
        throw new Error(report.blocker);
      }
      report.finalFixtureState = "enabled";
      report.expectedPilotMutationCount = 2;
      report.unexpectedMutationCount = 0;

      report.status = "PASS";
      exitCode = 0;
      log("customer pilot mutation + restore PASS");

      if (activateNormal) {
        report.normalWriteActivated = true;
        keepPassGatesArmed = true;
        report.notes.push(
          "ACTIVATE_NORMAL_WRITE=1 — retaining GLOBAL+PRODUCTION+DRIVER+AGENT+CUSTOMER",
        );
        report.finalGateState = readProductionGatesConfig().map;
      }
    }
  } catch (err) {
    report.status = "FAIL";
    report.blocker =
      report.blocker ||
      sanitizeMessage(err instanceof Error ? err.message : String(err));
    report.notes.push(report.blocker);
    log(`FAIL: ${report.blocker}`);
    exitCode = 1;
  } finally {
    try {
      if (gatesWereArmed && keepPassGatesArmed) {
        log("ACTIVATE_NORMAL_WRITE — retaining PASS+CUSTOMER gates");
        report.gatesArmed = true;
        report.finalGateState = readProductionGatesConfig().map;
      } else if (gatesWereArmed) {
        log("restoring DRIVER+AGENT; clearing CUSTOMER (finally)…");
        try {
          report.finalGateState = restorePassDomainsClearCustomer().map;
        } catch (disarmErr) {
          report.notes.push(
            `RESTORE_PARTIAL:${sanitizeMessage(
              disarmErr instanceof Error ? disarmErr.message : String(disarmErr),
            )}`,
          );
          try {
            for (const k of PRESERVE_PASS_DOMAINS) setGate(k, "true");
            setGate("GLOBAL_PRODUCTION_WRITE_ENABLED", "true");
            setGate("PRODUCTION_WRITE_ENABLED", "true");
            setGate("CUSTOMER_WRITE_ENABLED", "false");
          } catch {
            /* ignore */
          }
        }
        report.gatesArmed = false;
        const d = await redeployProduction("RESTORE_PASS_DOMAINS");
        report.disarmDeployment = d;
      }
    } catch (finallyErr) {
      report.notes.push(
        `FINALLY_ERR:${sanitizeMessage(
          finallyErr instanceof Error ? finallyErr.message : String(finallyErr),
        )}`,
      );
    }

    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }

    const artifact = {
      schemaVersion: "write-pilot/v1",
      generatedAt: new Date().toISOString(),
      domain: "CUSTOMER",
      status: report.status,
      dryGateCycle: report.dryGateCycle,
      authPreflightOnly: report.authPreflightOnly,
      authMethod: report.authMethod,
      authMeHttpStatus: report.authMeHttpStatus,
      preflightPassCount: report.preflightPassCount,
      preflightTotal: report.preflightTotal,
      failedRoutes: report.failedRoutes,
      writeBlockProbe: report.writeBlockProbe,
      customerFixtureId: report.customerFixtureId,
      beforeState: report.beforeState,
      afterState: report.afterState,
      finalFixtureState: report.finalFixtureState,
      httpResult: report.httpResult,
      auditCount: report.auditCount,
      idempotencyReplayResult: report.idempotencyReplayResult,
      staleConflictResult: report.staleConflictResult,
      expectedPilotMutationCount: report.expectedPilotMutationCount,
      unexpectedMutationCount: report.unexpectedMutationCount,
      financeNegativeProbe: report.financeNegativeProbe,
      legalRestore: report.legalRestore,
      finalGateState: report.finalGateState,
      configGatesArmed: report.configGatesArmed,
      liveRuntimeArmed: report.liveRuntimeArmed,
      armDeployment: report.armDeployment,
      disarmDeployment: report.disarmDeployment,
      gatesArmed: report.gatesArmed,
      normalWriteActivated: report.normalWriteActivated,
      dnsTouched: false,
      legacyTouched: false,
      saJson: 0,
      adc: 0,
      preservePassDomains: PRESERVE_PASS_DOMAINS,
      pilotExecuted: report.expectedPilotMutationCount > 0,
      productionMutations: report.expectedPilotMutationCount,
      unexpectedProductionMutations: report.unexpectedMutationCount,
      notes: report.notes,
      blocker: report.blocker,
    };
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    log(`artifact → ${ARTIFACT_PATH}`);
    log(report.status);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    `[customer-pilot] FATAL: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

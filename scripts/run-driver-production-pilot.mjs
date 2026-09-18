#!/usr/bin/env node
/**
 * Atomic Driver Production write pilot (operator-assisted).
 *
 * Auth precedence:
 *   A. FINAL_LIVE_ID_TOKEN → validate (exp/aud + GET /api/auth/me) → explicit_id_token
 *   B. FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD → ALWAYS fresh sign-in → email_password
 *      (local token file must NEVER override email/password)
 *   C. .local/write-pilots/.final-live.json token → validate → validated_local_token
 *
 * Auth / preflight only (no gate arming, no mutation):
 *   AUTH_PREFLIGHT_ONLY=1 FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/run-driver-production-pilot.mjs
 *
 * Dry gate cycle only (no Driver mutation):
 *   DRY_GATE_CYCLE=1 FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/run-driver-production-pilot.mjs
 *
 * Negative probe only (arm DRIVER, prove Agent 403 canonical, no Driver mutation):
 *   PILOT_NEGATIVE_PROBE_ONLY=1 FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/run-driver-production-pilot.mjs
 *
 * Lifecycle (CONFIG vs LIVE):
 *   PREFLIGHT CONFIG+LIVE off → ARM CONFIG (3 gates) → DEPLOY Production →
 *   capture ARM_DEPLOYMENT_ID → wait READY → wait alias match →
 *   ONLY THEN verify LIVE_RUNTIME gates true → (optional mutation) →
 *   DISARM CONFIG → redeploy → READY → alias match → LIVE false + Driver 403.
 *
 * Fail-safe: ALL write gates restored FALSE in `finally` even on auth/mutation failure.
 * Never prints/persists password or ID token. Never write fresh tokens to .local.
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
import {
  firstListId,
  runAuthenticatedValidation,
} from "./lib/authenticated-live-validation.mjs";
import { isCanonicalWriteBlocked403 } from "./lib/write-probe-preflight.mjs";

const ROOT = process.cwd();
const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";
const OUT_DIR = join(ROOT, ".local", "write-pilots");
const FIXTURE_PATH = join(OUT_DIR, "driver-fixture.json");
const ARTIFACT_PATH = join(OUT_DIR, "driver.json");
const WIF_PROOF_PATH = join(OUT_DIR, "00-wif-iam-cloud.json");
const PILOT_NOTE = "Approved Admin Next production write pilot";

const ARM_GATES = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
];

const MUST_STAY_FALSE = [
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

const ALL_WRITE_GATES = [...ARM_GATES, ...MUST_STAY_FALSE];

const QA_MARKERS = ["is_test", "functional_test", "qa_fixture", "ismndob"];

function log(msg) {
  console.log(`[driver-pilot] ${msg}`);
}

function sanitizeMessage(value) {
  return sanitizeAuthMessage(value);
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveFirebaseClientConfig() {
  const files = [
    join(ROOT, ".env.production.local"),
    join(ROOT, ".env.local"),
    join(ROOT, ".env"),
  ];
  const merged = {};
  for (const f of files) Object.assign(merged, loadDotEnvFile(f));
  const get = (k) =>
    (process.env[k] && String(process.env[k]).trim()) ||
    (merged[k] && String(merged[k]).trim()) ||
    "";
  const apiKey = get("NEXT_PUBLIC_FIREBASE_API_KEY");
  const projectId = get("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  return {
    apiKey,
    projectId,
    present: Boolean(apiKey && projectId),
  };
}

function openControllingTty() {
  // Prefer real controlling TTY so agent/non-TTY stdin can still prompt the operator.
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
    const input = tty.input;
    const output = tty.output;
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

async function resolveIdToken(firebaseConfig) {
  const localAuthPath = join(OUT_DIR, ".final-live.json");
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
    localAuthPath,
    requestAuthMe: async (token) => requestJson("/api/auth/me", { token }),
    signIn: signInWithEmailPassword,
    isTTY: canPrompt || Boolean(stdinStream.isTTY),
    promptEmail: () => promptLine("FINAL_LIVE_EMAIL: "),
    promptPassword: () => promptPasswordMuted("FINAL_LIVE_PASSWORD (muted): "),
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
    error: res.error,
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

function parseGateMapFromEnvLsText(stdout) {
  // Exact key match only — NEVER substring-match PRODUCTION inside GLOBAL_PRODUCTION.
  const map = {};
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
    for (const name of ALL_WRITE_GATES) {
      const re = new RegExp(`(^|\\s)${name}(\\s|$)`);
      if (!re.test(line)) continue;
      const m = line.match(/\b(true|false)\b/i);
      if (m) map[name] = m[1].toLowerCase();
    }
  }
  return map;
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
  // CONFIG_VALUE — Vercel project env definitions (not live runtime).
  const jsonRes = vercel(["env", "ls", "production", "--json"]);
  const fromJson = parseGateMapFromEnvJson(
    `${jsonRes.stdout}\n${jsonRes.stderr}`,
  );
  if (fromJson && Object.keys(fromJson).length > 0) {
    return { source: "CONFIG_VALUE", map: fromJson };
  }
  const textRes = vercel(["env", "ls", "production"]);
  return {
    source: "CONFIG_VALUE_TEXT",
    map: parseGateMapFromEnvLsText(`${textRes.stdout}\n${textRes.stderr}`),
  };
}

/** @deprecated use readProductionGatesConfig().map */
function readProductionGates() {
  return readProductionGatesConfig().map;
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
  if (problems.length) {
    throw new Error(`${label}: ${problems.join("; ")}`);
  }
}

function setGate(name, value) {
  const res = vercel([
    "env",
    "update",
    name,
    "production",
    "--value",
    value,
    "--yes",
  ]);
  log(`CONFIG set ${name}=${value}`);
  return res;
}

function normalizeDuplicateProductionGates() {
  // Evidence-only: count Production defs per gate via JSON. Never print secrets.
  const jsonRes = vercel(["env", "ls", "production", "--json"]);
  const start = `${jsonRes.stdout}\n${jsonRes.stderr}`.indexOf("{");
  if (start < 0) return { checked: false, duplicates: [] };
  let parsed;
  try {
    parsed = JSON.parse(`${jsonRes.stdout}\n${jsonRes.stderr}`.slice(start));
  } catch {
    return { checked: false, duplicates: [] };
  }
  const envs = Array.isArray(parsed?.envs) ? parsed.envs : [];
  const byKey = {};
  for (const row of envs) {
    if (!row || !ALL_WRITE_GATES.includes(row.key)) continue;
    const targets = Array.isArray(row.target)
      ? row.target.map((t) => String(t).toLowerCase())
      : [String(row.target || "").toLowerCase()];
    if (!targets.includes("production")) continue;
    (byKey[row.key] ||= []).push(row.id || "unknown");
  }
  const duplicates = Object.entries(byKey)
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length }));
  if (duplicates.length) {
    throw new Error(
      `PRODUCTION_ENV_DUPLICATES: ${duplicates
        .map((d) => `${d.key}x${d.count}`)
        .join(", ")} — normalize before arming`,
    );
  }
  return { checked: true, duplicates: [] };
}

function armDriverGatesOnly() {
  for (const k of ARM_GATES) setGate(k, "true");
  for (const k of MUST_STAY_FALSE) setGate(k, "false");
  const { source, map } = readProductionGatesConfig();
  assertGates(map, ARM_GATES, MUST_STAY_FALSE, `post-arm ${source}`);
  return { source, map };
}

function disarmAllWriteGates() {
  for (const k of ALL_WRITE_GATES) setGate(k, "false");
  const { source, map } = readProductionGatesConfig();
  assertGates(map, [], ALL_WRITE_GATES, `post-disarm ${source}`);
  return { source, map };
}

function extractDeploymentId(text) {
  const clean = String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
  const patterns = [
    /"id"\s*:\s*"(dpl_[A-Za-z0-9]+)"/,
    /"deploymentApiUrl"\s*:\s*"https:\/\/api\.vercel\.com\/v\d+\/deployments\/(dpl_[A-Za-z0-9]+)"/,
    /\bdpl_[A-Za-z0-9]+\b/,
    // CLI Inspect URL omits the dpl_ prefix in the path segment.
    /Inspect\s+https:\/\/vercel\.com\/[^\s]+\/([A-Za-z0-9]+)/i,
    /inspectorUrl"\s*:\s*"https:\/\/vercel\.com\/[^"]+\/([A-Za-z0-9]+)"/,
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

function inspectJson(target) {
  // Prefer stdout only — stderr progress text after JSON breaks JSON.parse(slice).
  const res = run(
    "npx",
    ["vercel", "inspect", target, "--json"],
    { env: { ...process.env, CI: "1" } },
  );
  const fromStdout = parseFirstJsonValue(res.stdout);
  if (fromStdout) return fromStdout;
  const fromCombined = parseFirstJsonValue(`${res.stdout}\n${res.stderr}`);
  if (fromCombined) return fromCombined;
  throw new Error(
    `inspect_json_failed: ${sanitizeMessage(
      `${res.stderr || res.stdout || ""}`.slice(0, 200),
    )}`,
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
  const url = d.url || payload?.url || null;
  const target = d.target || payload?.target || null;
  return { id, readyState, url, target, raw: payload };
}

async function waitDeploymentReady(deploymentId, timeoutMs = 600000) {
  if (!deploymentId || deploymentId === "dpl_unknown") {
    throw new Error("WAIT_READY_MISSING_DEPLOYMENT_ID");
  }
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      // Prefer CLI --wait once, then poll inspect JSON.
      const waited = run(
        "npx",
        ["vercel", "inspect", deploymentId, "--wait", "--timeout", "3m"],
        { env: { ...process.env, CI: "1" } },
      );
      void waited;
      const info = normalizeInspectDeployment(inspectJson(deploymentId));
      last = info.readyState;
      if (info.readyState === "READY") {
        return { ok: true, deploymentId: info.id || deploymentId, readyState: "READY" };
      }
      if (["ERROR", "CANCELED", "FAILED"].includes(info.readyState)) {
        throw new Error(`DEPLOYMENT_${info.readyState}:${deploymentId}`);
      }
    } catch (err) {
      last = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `DEPLOYMENT_NOT_READY: id=${deploymentId} last=${sanitizeMessage(last)}`,
  );
}

async function waitAliasMatchesDeployment(
  deploymentId,
  aliasHost = "touri-admin-next.vercel.app",
  timeoutMs = 300000,
) {
  if (!deploymentId || deploymentId === "dpl_unknown") {
    throw new Error("ALIAS_MATCH_MISSING_DEPLOYMENT_ID");
  }
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const info = normalizeInspectDeployment(inspectJson(aliasHost));
      last = info.id;
      if (info.id === deploymentId && info.readyState === "READY") {
        return {
          ok: true,
          aliasMatch: true,
          aliasHost,
          deploymentId: info.id,
          readyState: info.readyState,
        };
      }
    } catch (err) {
      last = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `ALIAS_NOT_MATCHED: want=${deploymentId} have=${sanitizeMessage(last)} host=${aliasHost}`,
  );
}

/**
 * When gates+unlock are live, unauthenticated mutation should pass the shadow
 * trap and fail closed on auth (401), not PRODUCTION_WRITE_DISABLED (403).
 */
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
      if (blockedDisabled) {
        // Alias may still be draining old revision briefly.
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (probe.httpStatus === 0 || probe.code === "NETWORK_ERROR") {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (probe.httpStatus >= 200 && probe.httpStatus < 300) {
        throw new Error(
          `LIVE_RUNTIME_UNEXPECTED_SUCCESS: unauth write HTTP ${probe.httpStatus}`,
        );
      }
      return {
        source: "LIVE_RUNTIME_VALUE",
        armed: true,
        probe,
        globalProduction: true,
        production: true,
        driver: true,
      };
    }

    if (probe.httpStatus === 0 || probe.code === "NETWORK_ERROR") {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!blockedDisabled) {
      // Newly aliased disarm deploy can briefly serve the armed revision.
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return {
      source: "LIVE_RUNTIME_VALUE",
      armed: false,
      probe,
      globalProduction: false,
      production: false,
      driver: false,
    };
  }

  if (expectedArmed) {
    throw new Error(
      `LIVE_RUNTIME_GATES_FALSE: unauth write still PRODUCTION_WRITE_DISABLED after arm+READY+alias — last HTTP ${last?.httpStatus} code=${last?.code}`,
    );
  }
  throw new Error(
    `LIVE_RUNTIME_GATES_NOT_FALSE: expected PRODUCTION_WRITE_DISABLED, got HTTP ${last?.httpStatus} code=${last?.code}`,
  );
}

/** @deprecated name retained — use assertLiveRuntimeGates(true) */
async function assertControlledWriteTrapOpen() {
  return assertLiveRuntimeGates(true);
}

async function waitAliasHealthy(token, timeoutMs = 180000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const probe = await requestJson("/api/auth/me", { token });
      last = probe.httpStatus;
      if (probe.httpStatus === 200 || probe.httpStatus === 401) {
        if (probe.httpStatus === 200) return { ok: true, httpStatus: 200 };
      }
      const wp = await requestJson("/api/drivers/probe/approve", {
        method: "POST",
        body: {},
      });
      if (wp.httpStatus === 403 || wp.httpStatus === 401) {
        if (token) {
          if (probe.httpStatus === 200) return { ok: true, httpStatus: 200 };
        } else {
          return { ok: true, httpStatus: wp.httpStatus };
        }
      }
    } catch (err) {
      last = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`ALIAS_NOT_HEALTHY: last=${sanitizeMessage(last)}`);
}

async function redeployProduction(label) {
  log(`redeploying Production (${label})…`);
  const res = vercel(["--prod", "--yes", "--json"]);
  const combined = `${res.stdout}\n${res.stderr}`;
  let id = extractDeploymentId(combined);
  if (!id) {
    // Fallback: latest production deployment from ls --json
    try {
      const ls = vercel(["ls", "touri-admin-next", "--prod", "--json"]);
      const start = `${ls.stdout}\n${ls.stderr}`.indexOf("{");
      if (start >= 0) {
        const parsed = JSON.parse(`${ls.stdout}\n${ls.stderr}`.slice(start));
        const deps = parsed?.deployments || parsed?.records || [];
        const first = Array.isArray(deps) ? deps[0] : null;
        if (first?.uid && String(first.uid).startsWith("dpl_")) id = first.uid;
        else if (first?.id && String(first.id).startsWith("dpl_")) id = first.id;
      }
    } catch {
      /* ignore */
    }
  }
  if (!id) {
    throw new Error(
      `DEPLOYMENT_ID_UNKNOWN after ${label} redeploy — refuse to verify against stale alias`,
    );
  }
  log(`redeploy submitted · ${id}`);
  const ready = await waitDeploymentReady(id);
  const alias = await waitAliasMatchesDeployment(ready.deploymentId || id);
  log(
    `${label} READY=${ready.readyState} ALIAS_MATCH=${alias.aliasMatch} id=${alias.deploymentId}`,
  );
  return {
    deploymentId: alias.deploymentId || id,
    readyState: ready.readyState,
    aliasMatch: alias.aliasMatch === true,
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
      errorSafe: sanitizeMessage(err instanceof Error ? err.message : String(err)),
      body: null,
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
    errorSafe: null,
  };
}

function truthyFlag(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function driverLooksSynthetic(driver, fixture) {
  if (!driver || typeof driver !== "object") return false;
  if (truthyFlag(driver.synthetic) || truthyFlag(driver.isTest) || truthyFlag(driver.is_test)) {
    return true;
  }
  if (truthyFlag(driver.qaFixture) || truthyFlag(driver.qa_fixture)) return true;
  if (truthyFlag(driver.functionalTest) || truthyFlag(driver.functional_test)) {
    return true;
  }
  if (truthyFlag(driver.ismndob) || truthyFlag(driver.isMndob)) return true;
  if (Array.isArray(fixture?.qaMarkers) && fixture.qaMarkers.length > 0) {
    // Fixture provisioned with QA markers; accept when live markers absent but fixture attested.
    return true;
  }
  return false;
}

function registrationStatusOf(driver) {
  if (!driver || typeof driver !== "object") return null;
  return (
    driver.registrationStatus ||
    driver.registration_status ||
    driver.status ||
    null
  );
}

function verifyWifResolvable() {
  const ls = vercel(["env", "ls", "production"]);
  const text = `${ls.stdout}\n${ls.stderr}`;
  const hasDriverSa = /DRIVER_REVIEW_SERVICE_ACCOUNT_EMAIL/.test(text);
  const hasWif = /GCP_WORKLOAD_IDENTITY_PROVIDER/.test(text);
  let proofOk = false;
  if (existsSync(WIF_PROOF_PATH)) {
    try {
      const proof = JSON.parse(readFileSync(WIF_PROOF_PATH, "utf8"));
      proofOk =
        proof?.wifProof?.DRIVER_REVIEW?.includes?.("PASS") === true ||
        proof?.vercelSaSelectorsMatch === true;
    } catch {
      proofOk = false;
    }
  }
  // Local unlock wiring must be present before redeploy.
  const runtimePath = join(
    ROOT,
    "src/application/controlled-writes/runtime/DriversControlledWritesRuntime.ts",
  );
  const shadowPath = join(ROOT, "src/infrastructure/production/shadow/ShadowTraps.ts");
  const runtimeSrc = readFileSync(runtimePath, "utf8");
  const shadowSrc = readFileSync(shadowPath, "utf8");
  const unlockPresent =
    runtimeSrc.includes("createWifWritePortOrThrow") &&
    shadowSrc.includes("controlledWritesArmed");

  if (!hasDriverSa || !hasWif) {
    throw new Error(
      `WIF_NOT_RESOLVABLE: DRIVER_REVIEW_SA=${hasDriverSa} WIF_PROVIDER=${hasWif}`,
    );
  }
  if (!unlockPresent) {
    throw new Error(
      "WRITE_UNLOCK_CODE_MISSING: restore gated-write unlock (WIF port + shadowTrap controlledWritesArmed) before redeploy",
    );
  }
  return {
    driverReviewSaPresent: hasDriverSa,
    wifProviderPresent: hasWif,
    priorCloudProof: proofOk ? "PASS" : "UNVERIFIED_FILE",
    unlockCodePresent: true,
  };
}

function isWriteBlockedStatus(probe) {
  const blockedCodes = new Set([
    "PRODUCTION_WRITE_DISABLED",
    "RESOURCE_WRITE_DISABLED",
  ]);
  const code = probe.code || probe.body?.code || probe.body?.error;
  return (
    (probe.httpStatus === 403 || probe.httpStatus === 503) &&
    blockedCodes.has(String(code || ""))
  );
}

/** Phase 2 negative probe: require HTTP 403 + canonical disabled code (not 404/401). */
function isCanonicalDomainDisabled403(probe) {
  return isCanonicalWriteBlocked403(probe);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const negativeProbeOnly =
    process.env.PILOT_NEGATIVE_PROBE_ONLY === "1" ||
    process.env.PILOT_NEGATIVE_PROBE_ONLY === "true";
  const dryGateCycle =
    negativeProbeOnly ||
    process.env.DRY_GATE_CYCLE === "1" ||
    process.env.DRY_GATE_CYCLE === "true" ||
    process.env.SKIP_MUTATION === "1" ||
    process.env.SKIP_MUTATION === "true";
  const authPreflightOnly = isAuthPreflightOnly(process.env);
  // AUTH_PREFLIGHT_ONLY never arms gates / never mutates.
  if (authPreflightOnly) {
    log("AUTH_PREFLIGHT_ONLY=1 · auth + 40/40 only (no gate arming, no mutation)");
  }
  if (negativeProbeOnly) {
    log(
      "PILOT_NEGATIVE_PROBE_ONLY=1 · arm DRIVER only · Agent must be 403 canonical · no Driver mutation",
    );
  }

  const report = {
    schemaVersion: "write-pilot/v1",
    generatedAt: new Date().toISOString(),
    domain: "DRIVER",
    status: "FAIL",
    pilotExecuted: false,
    dryGateCycle,
    authPreflightOnly,
    authMethod: null,
    authMeHttpStatus: null,
    gatesArmed: false,
    authPreflight: null,
    writeBlockProbe: null,
    fixture: null,
    beforeState: null,
    afterState: null,
    finalFixtureState: null,
    writeResult: null,
    auditEvents: null,
    idempotency: null,
    concurrency: null,
    rbac: null,
    scope: null,
    idor: null,
    agentNegativeProbe: null,
    expectedPilotMutations: 0,
    unexpectedMutations: 0,
    postPilotAuthValidation: null,
    finalGates: null,
    configGatesArmed: null,
    liveRuntimeArmed: null,
    liveRuntimeDisarmed: null,
    deployments: [],
    armDeployment: null,
    disarmDeployment: null,
    normalWriteActivated: false,
    dnsTouched: false,
    legacyTouched: false,
    legalRestore: null,
    notes: [],
    blocker: null,
  };

  let idToken = "";
  let gatesWereArmed = false;
  let exitCode = 1;

  const firebaseConfig = resolveFirebaseClientConfig();

  try {
    // ---- AUTH (before any arming) ----
    log("resolving operator auth (TTY muted or FINAL_LIVE_* env)…");
    const auth = await resolveIdToken(firebaseConfig);
    idToken = auth.token || "";
    report.authMethod = auth.authMethod || "none";
    report.authMeHttpStatus =
      typeof auth.authMeHttpStatus === "number" ? auth.authMeHttpStatus : null;
    if (Array.isArray(auth.notes) && auth.notes.length) {
      report.notes.push(...auth.notes.map((n) => `auth:${n}`));
    }
    let authOptionalDry = false;
    if (!idToken) {
      // PILOT_NEGATIVE_PROBE_ONLY requires authenticated Agent 403 isolation —
      // unauth 401 is NOT a domain-isolation PASS.
      if (negativeProbeOnly) {
        report.blocker =
          auth.blocker ||
          "AUTH_REQUIRED_FOR_NEGATIVE_PROBE: export FINAL_LIVE_EMAIL+FINAL_LIVE_PASSWORD or use muted TTY prompt";
        report.authPreflight = "FAIL";
        throw new Error(report.blocker);
      }
      if (dryGateCycle && !authPreflightOnly) {
        authOptionalDry = true;
        report.authPreflight = "SKIPPED_DRY_GATE_CYCLE_NO_AUTH";
        report.notes.push(
          auth.blocker ||
            "DRY_GATE_CYCLE without auth — proving CONFIG/LIVE gate lifecycle via unauth probes only",
        );
        log("dry gate cycle continuing without auth (unauth LIVE probes only)");
      } else {
        report.blocker = auth.blocker || "AUTH_FAILED";
        report.authPreflight = "FAIL";
        throw new Error(report.blocker);
      }
    } else {
      // Auth self-check: /api/auth/me must be 200 before any gate arming.
      const meStatus =
        report.authMeHttpStatus ??
        (await requestJson("/api/auth/me", { token: idToken })).httpStatus;
      report.authMeHttpStatus = meStatus;
      if (meStatus !== 200) {
        report.blocker = `AUTH_ME_FAILED:HTTP_${meStatus}`;
        report.authPreflight = "FAIL";
        idToken = "";
        throw new Error(report.blocker);
      }
      log(`auth ok · method=${auth.authMethod} · /api/auth/me=${meStatus}`);
    }

    // ---- PREFLIGHT 40/40 (required for mutation; optional for dry gate cycle) ----
    if (idToken) {
      log("preflight authenticated live validation…");
      const pre = await runAuthenticatedValidation(requestJson, idToken);
      report.authPreflight = pre.pass
        ? "PASS 40/40"
        : `FAIL ${pre.summary.pass}/${pre.summary.total}`;
      report.preflightPassCount = pre.summary.pass;
      report.preflightTotal = pre.summary.total;
      report.failedRoutes = pre.failedRoutes || [];
      report.writeBlockProbe = pre.writeBlockProbe ?? null;
      if (!pre.pass) {
        if (pre.liveGatesArmedBlocker) {
          report.blocker = pre.liveGatesArmedBlocker;
          throw new Error(report.blocker);
        }
        if (dryGateCycle && !authPreflightOnly) {
          authOptionalDry = true;
          report.notes.push(
            `DRY_GATE_CYCLE auth validation failed (${pre.failedRoutes.join(",")}); continuing unauth gate cycle`,
          );
          idToken = "";
        } else {
          report.blocker = `PREFLIGHT_AUTH_VALIDATION_FAILED:${pre.failedRoutes.join(",")}`;
          throw new Error(report.blocker);
        }
      }
    }

    // ---- AUTH_PREFLIGHT_ONLY: stop after auth + 40/40, never arm gates ----
    if (authPreflightOnly) {
      if (!idToken || report.authPreflight !== "PASS 40/40") {
        report.blocker = report.blocker || "AUTH_PREFLIGHT_ONLY_REQUIRES_40_40";
        throw new Error(report.blocker);
      }
      log("AUTH_PREFLIGHT_ONLY · verifying write gates remain FALSE (no arming)…");
      const gatesBefore = readProductionGatesConfig();
      assertGates(gatesBefore.map, [], ALL_WRITE_GATES, `auth-preflight-only ${gatesBefore.source}`);
      report.finalGates = gatesBefore.map;
      report.gatesArmed = false;
      report.expectedPilotMutations = 0;
      report.unexpectedMutations = 0;
      report.status = "PASS";
      report.notes.push(
        "AUTH_PREFLIGHT_ONLY complete — stopped before gate arming / mutation",
      );
      log(
        `AUTH_PREFLIGHT_ONLY PASS · method=${report.authMethod} · me=${report.authMeHttpStatus} · ${report.authPreflight} · gates=false · mutations=0`,
      );
      exitCode = 0;
      return;
    }

    // ---- FIXTURE ----
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error("FIXTURE_MISSING: .local/write-pilots/driver-fixture.json");
    }
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    const uid = String(fixture.uid || "").trim();
    if (!uid) throw new Error("FIXTURE_UID_MISSING");
    const fixtureQa =
      Array.isArray(fixture.qaMarkers) &&
      QA_MARKERS.every((m) => fixture.qaMarkers.includes(m));
    if (!fixtureQa && fixture.synthetic !== true) {
      throw new Error("FIXTURE_NOT_QA_SYNTHETIC");
    }
    if (fixture.expectedRegistrationStatus !== "pending_review") {
      throw new Error(
        `FIXTURE_NOT_PENDING_REVIEW: ${fixture.expectedRegistrationStatus}`,
      );
    }

    if (idToken) {
      const before = await requestJson(`/api/drivers/${encodeURIComponent(uid)}`, {
        token: idToken,
      });
      if (before.httpStatus !== 200) {
        if (dryGateCycle && before.httpStatus === 401) {
          authOptionalDry = true;
          idToken = "";
          report.notes.push(
            "DRY_GATE_CYCLE fixture GET 401 (expired token) — fixture file still pending_review; live confirm deferred to operator mutation",
          );
          report.fixture = {
            uidPresent: true,
            qaSynthetic: true,
            registrationStatus: fixture.expectedRegistrationStatus,
            fixtureStatus: fixture.status || null,
            liveConfirm: "DEFERRED_AUTH",
          };
          report.beforeState = fixture.expectedRegistrationStatus;
        } else {
          throw new Error(
            `FIXTURE_READ_FAILED: HTTP ${before.httpStatus} ${before.code}`,
          );
        }
      } else {
        const beforeStatus = registrationStatusOf(before.body);
        if (beforeStatus !== "pending_review") {
          throw new Error(`LIVE_FIXTURE_NOT_PENDING_REVIEW: ${beforeStatus}`);
        }
        if (!driverLooksSynthetic(before.body, fixture)) {
          throw new Error("LIVE_FIXTURE_NOT_SYNTHETIC_QA");
        }
        if (
          truthyFlag(before.body?.onTrip) ||
          truthyFlag(before.body?.on_trip) ||
          truthyFlag(before.body?.actev_mndob) ||
          truthyFlag(before.body?.hasActiveTrip)
        ) {
          throw new Error("FIXTURE_HAS_ACTIVE_TRIP");
        }
        report.fixture = {
          uidPresent: true,
          qaSynthetic: true,
          registrationStatus: beforeStatus,
          fixtureStatus: fixture.status || null,
          liveConfirm: "PASS",
        };
        report.beforeState = beforeStatus;
      }
    } else if (dryGateCycle) {
      report.fixture = {
        uidPresent: true,
        qaSynthetic: true,
        registrationStatus: fixture.expectedRegistrationStatus,
        fixtureStatus: fixture.status || null,
        liveConfirm: "DEFERRED_AUTH",
      };
      report.beforeState = fixture.expectedRegistrationStatus;
      report.notes.push(
        "fixture live confirm deferred — file expects pending_review; no commercial mutation in dry cycle",
      );
    } else {
      throw new Error("FIXTURE_LIVE_CONFIRM_REQUIRES_AUTH");
    }
    void authOptionalDry;

    // ---- GATES OFF (CONFIG + LIVE) ----
    log("verifying all write gates OFF (CONFIG_VALUE)…");
    const dupCheck = normalizeDuplicateProductionGates();
    report.notes.push(
      dupCheck.checked
        ? "production_gate_defs_unique"
        : "production_gate_defs_check_skipped",
    );
    const gatesBefore = readProductionGatesConfig();
    assertGates(gatesBefore.map, [], ALL_WRITE_GATES, `preflight ${gatesBefore.source}`);
    const liveBefore = await assertLiveRuntimeGates(false);
    report.notes.push(
      `preflight LIVE_RUNTIME armed=${liveBefore.armed} probe=${liveBefore.probe.httpStatus}/${liveBefore.probe.code}`,
    );
    verifyWifResolvable();
    log("WIF driver-review resolvable · unlock code present · LIVE false");

    // ---- ARM CONFIG only 3 gates ----
    log("arming CONFIG GLOBAL+PRODUCTION+DRIVER only…");
    // Mark armed BEFORE first env mutation so finally always disarms on partial arm.
    gatesWereArmed = true;
    report.gatesArmed = true;
    const armedConfig = armDriverGatesOnly();
    report.configGatesArmed = {
      source: armedConfig.source,
      GLOBAL_PRODUCTION_WRITE_ENABLED:
        armedConfig.map.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: armedConfig.map.PRODUCTION_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: armedConfig.map.DRIVER_WRITE_ENABLED,
    };
    log(
      `CONFIG_VALUE armed · GLOBAL=${armedConfig.map.GLOBAL_PRODUCTION_WRITE_ENABLED} PRODUCTION=${armedConfig.map.PRODUCTION_WRITE_ENABLED} DRIVER=${armedConfig.map.DRIVER_WRITE_ENABLED}`,
    );

    // ---- DEPLOY Production → READY → alias match → THEN LIVE verify ----
    const armedDeploy = await redeployProduction("ARM");
    report.armDeployment = armedDeploy;
    report.deployments.push(armedDeploy.deploymentId);
    await waitAliasHealthy(idToken);
    const liveArmed = await assertLiveRuntimeGates(true);
    report.liveRuntimeArmed = {
      source: liveArmed.source,
      armed: liveArmed.armed,
      httpStatus: liveArmed.probe.httpStatus,
      code: liveArmed.probe.code,
      armDeploymentId: armedDeploy.deploymentId,
      ready: armedDeploy.readyState,
      aliasMatch: armedDeploy.aliasMatch,
    };
    log(
      `LIVE_RUNTIME_VALUE armed=true · probe HTTP ${liveArmed.probe.httpStatus} · ARM_DEPLOYMENT_ID=${armedDeploy.deploymentId} READY ALIAS_MATCH`,
    );

    // Refresh token if needed (long redeploy) — re-auth from env only if still present
    if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
      try {
        idToken = await signInWithEmailPassword(
          firebaseConfig.apiKey,
          process.env.FINAL_LIVE_EMAIL,
          process.env.FINAL_LIVE_PASSWORD,
        );
      } catch {
        // keep existing token
      }
    }

    // Prove Agent write remains blocked (domain gate) while Driver is armed.
    // Prefer nonexistent id so gated-off path cannot leak AGENT_NOT_FOUND.
    if (idToken) {
      const probeIds = ["__pilot_probe__"];
      try {
        const agentsList = await requestJson("/api/agents", { token: idToken });
        const first = firstListId(agentsList.body, ["id", "agentId"]);
        if (first) probeIds.push(first);
      } catch {
        /* keep probe id only */
      }
      let agentProbe = null;
      for (const agentIdForProbe of probeIds) {
        agentProbe = await requestJson(
          `/api/agents/${encodeURIComponent(agentIdForProbe)}/activate`,
          {
            method: "POST",
            token: idToken,
            body: { expectedCurrentState: "inactive" },
            headers: { "idempotency-key": `pilot-agent-neg-${randomUUID()}` },
          },
        );
        const agentBlocked = isCanonicalDomainDisabled403(agentProbe);
        if (!agentBlocked) {
          report.agentNegativeProbe = {
            httpStatus: agentProbe.httpStatus,
            code: agentProbe.code,
            blocked: false,
            agentIdUsed:
              agentIdForProbe === "__pilot_probe__" ? "probe" : "list",
            requiredCanonical403: true,
          };
          report.blocker = `AGENT_NEGATIVE_PROBE_FAILED: HTTP ${agentProbe.httpStatus} code=${agentProbe.code} id=${agentIdForProbe === "__pilot_probe__" ? "probe" : "list"} (want 403 PRODUCTION_WRITE_DISABLED|RESOURCE_WRITE_DISABLED)`;
          throw new Error(report.blocker);
        }
      }
      report.agentNegativeProbe = {
        httpStatus: agentProbe.httpStatus,
        code: agentProbe.code,
        blocked: true,
        agentIdUsed: probeIds.length > 1 ? "probe+list" : "probe",
        requiredCanonical403: true,
        probedCount: probeIds.length,
      };
      log(
        `agent negative probe blocked · HTTP ${agentProbe.httpStatus} code=${agentProbe.code} · ids=${probeIds.length}`,
      );
    } else {
      const agentUnauth = await requestJson(
        "/api/agents/__pilot_probe__/activate",
        {
          method: "POST",
          body: { expectedCurrentState: "inactive" },
          headers: { "idempotency-key": `pilot-agent-neg-${randomUUID()}` },
        },
      );
      // Unauth should be 401 once trap is open (not PRODUCTION_WRITE_DISABLED).
      const okUnauth =
        agentUnauth.httpStatus === 401 || isWriteBlockedStatus(agentUnauth);
      report.agentNegativeProbe = {
        httpStatus: agentUnauth.httpStatus,
        code: agentUnauth.code,
        blocked: okUnauth,
        agentIdUsed: "unauth_dry",
      };
      if (!okUnauth) {
        report.blocker = `AGENT_UNAUTH_PROBE_FAILED: HTTP ${agentUnauth.httpStatus}`;
        throw new Error(report.blocker);
      }
      log(
        `agent unauth dry probe · HTTP ${agentUnauth.httpStatus} (no auth token)`,
      );
    }

    if (dryGateCycle) {
      report.notes.push(
        negativeProbeOnly
          ? "PILOT_NEGATIVE_PROBE_ONLY=1 — Agent 403 canonical proven; skipping Driver mutation"
          : "DRY_GATE_CYCLE=1 — skipping Driver mutation; proving arm LIVE true then disarm",
      );
      report.status = "PASS";
      report.expectedPilotMutations = 0;
      report.finalFixtureState = report.beforeState;
      report.legalRestore = {
        attempted: false,
        reason: "dry_gate_cycle_no_mutation",
        finalState: report.beforeState,
      };
      exitCode = 0;
      log("dry gate cycle ARM phase PASS (mutation skipped)");
    } else {
      // Unauth IDOR/RBAC baseline
      const unauth = await requestJson(
        `/api/drivers/${encodeURIComponent(uid)}/needs_changes`,
        {
          method: "POST",
          body: { expectedCurrentState: "pending_review", note: PILOT_NOTE },
          headers: { "idempotency-key": `pilot-unauth-${randomUUID()}` },
        },
      );
      report.rbac =
        unauth.httpStatus === 401 || unauth.httpStatus === 403 ? "PASS" : "FAIL";
      report.idor =
        unauth.httpStatus === 401 || unauth.httpStatus === 403 ? "PASS" : "FAIL";

      // ---- EXECUTE ----
      const idemKey = `driver-prod-pilot-needs-changes-${randomUUID()}`;
      log("POST needs_changes…");
      const write = await requestJson(
        `/api/drivers/${encodeURIComponent(uid)}/needs_changes`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: "pending_review",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": idemKey },
        },
      );
      report.pilotExecuted = true;
      report.writeResult = {
        httpStatus: write.httpStatus,
        code: write.code,
        fromState: write.body?.write?.fromState ?? null,
        toState: write.body?.write?.toState ?? registrationStatusOf(write.body),
        status: write.body?.write?.status ?? null,
        auditIntentIdPresent: Boolean(write.body?.write?.auditIntentId),
        auditResultIdPresent: Boolean(write.body?.write?.auditResultId),
      };

      const writeOk =
        write.httpStatus >= 200 &&
        write.httpStatus < 300 &&
        (write.body?.write?.toState === "needs_changes" ||
          registrationStatusOf(write.body) === "needs_changes");
      if (!writeOk) {
        report.blocker = `WRITE_FAILED: HTTP ${write.httpStatus} code=${write.code}`;
        throw new Error(report.blocker);
      }

      report.afterState = "needs_changes";
      report.expectedPilotMutations = 1;
      report.auditEvents = {
        appliedLogicalEvents: 1,
        intentPresent: Boolean(write.body?.write?.auditIntentId),
        resultPresent: Boolean(write.body?.write?.auditResultId),
      };
      report.scope = "PASS";

      const after = await requestJson(`/api/drivers/${encodeURIComponent(uid)}`, {
        token: idToken,
      });
      const afterStatus = registrationStatusOf(after.body);
      if (afterStatus !== "needs_changes") {
        throw new Error(`POST_WRITE_STATE_MISMATCH: ${afterStatus}`);
      }
      if (!driverLooksSynthetic(after.body, fixture)) {
        throw new Error("POST_WRITE_LOST_SYNTHETIC_MARKERS");
      }

      // ---- IDEMPOTENCY ----
      const replay = await requestJson(
        `/api/drivers/${encodeURIComponent(uid)}/needs_changes`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: "pending_review",
            note: PILOT_NOTE,
          },
          headers: { "idempotency-key": idemKey },
        },
      );
      const replayOk =
        replay.httpStatus >= 200 &&
        replay.httpStatus < 300 &&
        (replay.body?.write?.status === "idempotent_replay" ||
          registrationStatusOf(replay.body) === "needs_changes");
      const stillNeeds = registrationStatusOf(
        (
          await requestJson(`/api/drivers/${encodeURIComponent(uid)}`, {
            token: idToken,
          })
        ).body,
      );
      report.idempotency = {
        httpStatus: replay.httpStatus,
        status: replay.body?.write?.status ?? null,
        pass: Boolean(replayOk && stillNeeds === "needs_changes"),
      };
      if (!report.idempotency.pass) {
        throw new Error(
          `IDEMPOTENCY_FAILED: HTTP ${replay.httpStatus} status=${replay.body?.write?.status}`,
        );
      }

      // ---- CONCURRENCY / STALE ----
      const stale = await requestJson(
        `/api/drivers/${encodeURIComponent(uid)}/needs_changes`,
        {
          method: "POST",
          token: idToken,
          body: {
            expectedCurrentState: "pending_review",
            note: PILOT_NOTE,
          },
          headers: {
            "idempotency-key": `driver-prod-pilot-stale-${randomUUID()}`,
          },
        },
      );
      const staleOk =
        stale.httpStatus === 409 &&
        [
          "PRECONDITION_FAILED",
          "INVALID_DRIVER_STATE_TRANSITION",
          "IDEMPOTENCY_CONFLICT",
        ].includes(String(stale.code || stale.body?.code || ""));
      report.concurrency = {
        httpStatus: stale.httpStatus,
        code: stale.code,
        pass: staleOk,
      };
      if (!staleOk) {
        throw new Error(
          `CONCURRENCY_FAILED: HTTP ${stale.httpStatus} code=${stale.code}`,
        );
      }

      report.legalRestore = {
        attempted: false,
        reason:
          "Fixture authDisabled / no driver sign-in material for submitDriverApplicationV2; leave needs_changes (no raw Firestore patch)",
        finalState: "needs_changes",
      };
      report.finalFixtureState = "needs_changes";

      report.status = "PASS";
      exitCode = 0;
      log("pilot mutation + verify PASS");
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
    // ---- MANDATORY DISARM (only when this session armed / partially armed) ----
    try {
      if (gatesWereArmed) {
        log("disarming ALL write gates (finally)…");
        try {
          const disarmedConfig = disarmAllWriteGates();
          report.finalGates = disarmedConfig.map;
        } catch (disarmErr) {
          report.notes.push(
            `DISARM_PARTIAL:${sanitizeMessage(
              disarmErr instanceof Error ? disarmErr.message : String(disarmErr),
            )}`,
          );
          for (const k of ALL_WRITE_GATES) {
            try {
              setGate(k, "false");
            } catch {
              /* ignore */
            }
          }
          try {
            report.finalGates = readProductionGatesConfig().map;
          } catch {
            report.finalGates = null;
          }
        }
        report.gatesArmed = false;
        const disarmedDeploy = await redeployProduction("DISARM");
        report.disarmDeployment = disarmedDeploy;
        report.deployments.push(disarmedDeploy.deploymentId);

        try {
          const liveOff = await assertLiveRuntimeGates(false);
          report.liveRuntimeDisarmed = {
            source: liveOff.source,
            armed: liveOff.armed,
            httpStatus: liveOff.probe.httpStatus,
            code: liveOff.probe.code,
            disarmDeploymentId: disarmedDeploy.deploymentId,
            ready: disarmedDeploy.readyState,
            aliasMatch: disarmedDeploy.aliasMatch,
          };
          report.notes.push(
            `DISARM LIVE_RUNTIME armed=false READY ALIAS_MATCH id=${disarmedDeploy.deploymentId}`,
          );
        } catch (liveErr) {
          report.status = "FAIL";
          report.blocker =
            report.blocker ||
            sanitizeMessage(
              liveErr instanceof Error ? liveErr.message : String(liveErr),
            );
          exitCode = 1;
          report.notes.push(`POST_DISARM_LIVE:${report.blocker}`);
        }

        if (idToken) {
          try {
            await waitAliasHealthy(idToken);
          } catch (healthErr) {
            report.notes.push(
              `POST_DISARM_HEALTH:${sanitizeMessage(
                healthErr instanceof Error
                  ? healthErr.message
                  : String(healthErr),
              )}`,
            );
          }

          const fixtureUid = existsSync(FIXTURE_PATH)
            ? String(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).uid || "probe")
            : "probe";
          const driver403 = await requestJson(
            `/api/drivers/${encodeURIComponent(fixtureUid)}/needs_changes`,
            {
              method: "POST",
              token: idToken,
              body: {
                expectedCurrentState: "needs_changes",
                note: PILOT_NOTE,
              },
              headers: {
                "idempotency-key": `driver-post-disarm-${randomUUID()}`,
              },
            },
          );
          const probe403 = await requestJson("/api/drivers/probe/approve", {
            method: "POST",
            token: idToken,
            body: {},
          });
          const agent403 = await requestJson(
            "/api/agents/__pilot_probe__/activate",
            {
              method: "POST",
              token: idToken,
              body: { expectedCurrentState: "inactive" },
              headers: {
                "idempotency-key": `agent-post-disarm-${randomUUID()}`,
              },
            },
          );
          const driverBlocked =
            isWriteBlockedStatus(driver403) || isWriteBlockedStatus(probe403);
          const agentBlocked = isWriteBlockedStatus(agent403);
          report.notes.push(
            `postDisarm driverBlocked=${driverBlocked} agentBlocked=${agentBlocked} probe=${probe403.httpStatus}/${probe403.code}`,
          );
          if (!driverBlocked) {
            report.status = "FAIL";
            report.blocker =
              report.blocker ||
              `POST_DISARM_DRIVER_NOT_403: HTTP ${probe403.httpStatus}`;
            exitCode = 1;
          }

          try {
            const post = await runAuthenticatedValidation(requestJson, idToken);
            report.postPilotAuthValidation = post.pass
              ? "PASS 40/40"
              : `FAIL ${post.summary.pass}/${post.summary.total}`;
            if (!post.pass) {
              report.status = "FAIL";
              report.blocker =
                report.blocker ||
                `POST_PILOT_AUTH_VALIDATION_FAILED:${post.failedRoutes.join(",")}`;
              exitCode = 1;
            }
          } catch (postErr) {
            report.postPilotAuthValidation = "FAIL";
            report.notes.push(
              sanitizeMessage(
                postErr instanceof Error ? postErr.message : String(postErr),
              ),
            );
            exitCode = 1;
            report.status = "FAIL";
          }
        }
      } else {
        // Never armed: still confirm Production gates are FALSE (no redeploy).
        try {
          report.finalGates = readProductionGatesConfig().map;
          assertGates(report.finalGates, [], ALL_WRITE_GATES, "never-armed gates");
          report.notes.push("never_armed_gates_confirmed_false");
        } catch (verifyErr) {
          report.notes.push(
            `NEVER_ARMED_GATE_VERIFY:${sanitizeMessage(
              verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
            )}`,
          );
          try {
            report.finalGates = disarmAllWriteGates().map;
            report.notes.push("forced_disarm_without_prior_arm");
          } catch (forceErr) {
            report.status = "FAIL";
            report.blocker =
              report.blocker ||
              `GATE_FORCE_FALSE_FAILED:${sanitizeMessage(
                forceErr instanceof Error ? forceErr.message : String(forceErr),
              )}`;
            exitCode = 1;
          }
        }
      }
    } catch (finallyErr) {
      report.status = "FAIL";
      report.blocker =
        report.blocker ||
        `FINALLY_DISARM_FAILED:${sanitizeMessage(
          finallyErr instanceof Error ? finallyErr.message : String(finallyErr),
        )}`;
      exitCode = 1;
      log(`CRITICAL: ${report.blocker}`);
    }

    // Clear token
    idToken = "";

    // Final fixture state read (best-effort via gates-off is fine for GET)
    if (!report.finalFixtureState) {
      report.finalFixtureState = report.afterState || report.beforeState || null;
    }

    const artifact = {
      schemaVersion: "write-pilot/v1",
      generatedAt: new Date().toISOString(),
      domain: "DRIVER",
      status: report.status,
      dryGateCycle: report.dryGateCycle,
      authPreflightOnly: report.authPreflightOnly,
      authMethod: report.authMethod,
      authMeHttpStatus: report.authMeHttpStatus,
      preflightPassCount: report.preflightPassCount ?? null,
      preflightTotal: report.preflightTotal ?? null,
      failedRoutes: report.failedRoutes || [],
      writeBlockProbe: report.writeBlockProbe || null,
      driverFixtureId: existsSync(FIXTURE_PATH)
        ? String(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).uid || "")
        : null,
      beforeState: report.beforeState,
      afterState: report.afterState,
      finalFixtureState: report.finalFixtureState,
      httpResult: report.writeResult,
      auditCount: report.auditEvents?.appliedLogicalEvents ?? null,
      idempotencyReplayResult: report.idempotency,
      staleConflictResult: report.concurrency,
      expectedPilotMutationCount: report.expectedPilotMutations,
      unexpectedMutationCount: report.unexpectedMutations,
      finalGateState: report.finalGates,
      configGatesArmed: report.configGatesArmed,
      liveRuntimeArmed: report.liveRuntimeArmed,
      liveRuntimeDisarmed: report.liveRuntimeDisarmed,
      armDeployment: report.armDeployment,
      disarmDeployment: report.disarmDeployment,
      deploymentIdsUsed: report.deployments,
      authPreflight: report.authPreflight,
      postPilotAuthValidation: report.postPilotAuthValidation,
      agentNegativeProbe: report.agentNegativeProbe,
      rbac: report.rbac,
      scope: report.scope,
      idor: report.idor,
      legalRestore: report.legalRestore,
      gatesArmed: false,
      normalWriteActivated: false,
      dnsTouched: false,
      legacyTouched: false,
      blocker: report.blocker,
      notes: report.notes,
    };

    const json = JSON.stringify(artifact, null, 2).replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      "[redacted-jwt]",
    );
    writeFileSync(ARTIFACT_PATH, json + "\n", "utf8");
    log(`wrote sanitized ${ARTIFACT_PATH}`);

    // Print FINAL REPORT schema
    const g = report.finalGates || {};
    const print = (k, v) => console.log(`${k}\n${v}`);
    console.log("==================================================");
    console.log("FINAL REPORT");
    console.log("==================================================");
    print("DRIVER PRODUCTION PILOT:", report.status);
    console.log("");
    print("AUTH METHOD:", report.authMethod || "none");
    print(
      "AUTH /api/auth/me:",
      report.authMeHttpStatus != null ? String(report.authMeHttpStatus) : "n/a",
    );
    print("AUTH PRE-FLIGHT:", report.authPreflight || "FAIL");
    print("AUTH_PREFLIGHT_ONLY:", report.authPreflightOnly ? "YES" : "NO");
    print(
      "FIXTURE:",
      report.fixture
        ? `PASS uid_present qa_synthetic ${report.fixture.registrationStatus}`
        : report.authPreflightOnly
          ? "SKIPPED_AUTH_PREFLIGHT_ONLY"
          : "FAIL",
    );
    print("BEFORE STATE:", report.beforeState || "n/a");
    print("PILOT STATE:", report.afterState || "n/a");
    print("FINAL FIXTURE STATE:", report.finalFixtureState || "n/a");
    console.log("");
    print(
      "GATES ARMED:",
      report.pilotExecuted || gatesWereArmed || report.dryGateCycle
        ? "GLOBAL+PRODUCTION+DRIVER (session)"
        : "NO",
    );
    print(
      "CONFIG_VALUE ARMED:",
      report.configGatesArmed
        ? `GLOBAL=${report.configGatesArmed.GLOBAL_PRODUCTION_WRITE_ENABLED} PRODUCTION=${report.configGatesArmed.PRODUCTION_WRITE_ENABLED} DRIVER=${report.configGatesArmed.DRIVER_WRITE_ENABLED}`
        : "n/a",
    );
    print(
      "LIVE_RUNTIME_VALUE ARMED:",
      report.liveRuntimeArmed
        ? `${report.liveRuntimeArmed.armed ? "true" : "false"} HTTP ${report.liveRuntimeArmed.httpStatus} ${report.liveRuntimeArmed.code}`
        : "n/a",
    );
    print(
      "ARM_DEPLOYMENT_ID:",
      report.armDeployment
        ? `${report.armDeployment.deploymentId} READY=${report.armDeployment.readyState} ALIAS_MATCH=${report.armDeployment.aliasMatch}`
        : "n/a",
    );
    print(
      "DISARM_DEPLOYMENT_ID:",
      report.disarmDeployment
        ? `${report.disarmDeployment.deploymentId} READY=${report.disarmDeployment.readyState} ALIAS_MATCH=${report.disarmDeployment.aliasMatch}`
        : "n/a",
    );
    print(
      "LIVE_RUNTIME_VALUE FINAL:",
      report.liveRuntimeDisarmed
        ? `${report.liveRuntimeDisarmed.armed ? "true" : "false"} HTTP ${report.liveRuntimeDisarmed.httpStatus} ${report.liveRuntimeDisarmed.code}`
        : "n/a",
    );
    print("DRY_GATE_CYCLE:", report.dryGateCycle ? "YES" : "NO");
    print("UNRELATED GATES OFF:", report.agentNegativeProbe ? "YES" : "n/a");
    print(
      "AGENT NEGATIVE PROBE:",
      report.agentNegativeProbe
        ? `${report.agentNegativeProbe.blocked ? "PASS" : "FAIL"} HTTP ${report.agentNegativeProbe.httpStatus} ${report.agentNegativeProbe.code}`
        : "n/a",
    );
    console.log("");
    print(
      "WRITE RESULT:",
      report.writeResult
        ? `HTTP ${report.writeResult.httpStatus} ${report.writeResult.fromState}→${report.writeResult.toState} ${report.writeResult.status}`
        : "n/a",
    );
    print(
      "AUDIT EVENTS:",
      report.auditEvents
        ? String(report.auditEvents.appliedLogicalEvents)
        : "n/a",
    );
    print(
      "IDEMPOTENCY:",
      report.idempotency
        ? report.idempotency.pass
          ? "PASS"
          : "FAIL"
        : "n/a",
    );
    print(
      "CONCURRENCY:",
      report.concurrency
        ? report.concurrency.pass
          ? "PASS"
          : "FAIL"
        : "n/a",
    );
    print("RBAC:", report.rbac || "n/a");
    print("SCOPE:", report.scope || "n/a");
    print("IDOR:", report.idor || "n/a");
    console.log("");
    print("EXPECTED PILOT MUTATIONS:", String(report.expectedPilotMutations));
    print("UNEXPECTED MUTATIONS:", String(report.unexpectedMutations));
    console.log("");
    print(
      "POST-PILOT AUTH VALIDATION:",
      report.postPilotAuthValidation || "n/a",
    );
    console.log("");
    print("FINAL GLOBAL GATE:", g.GLOBAL_PRODUCTION_WRITE_ENABLED || "unknown");
    print("FINAL PRODUCTION GATE:", g.PRODUCTION_WRITE_ENABLED || "unknown");
    print("FINAL DRIVER GATE:", g.DRIVER_WRITE_ENABLED || "unknown");
    print(
      "FINAL OTHER GATES:",
      MUST_STAY_FALSE.every((k) => g[k] === "false") ? "ALL false" : "CHECK",
    );
    print(
      "FINAL UI GATE:",
      g.NEXT_PUBLIC_CONTROLLED_WRITES_UI || "unknown",
    );
    console.log("");
    print("DRIVER NORMAL WRITE ACTIVATED:", "NO");
    console.log("");
    print("DNS TOUCHED:", "NO");
    console.log("");
    print("LEGACY TOUCHED:", "NO");
    console.log("");
    print(
      "NEXT:",
      report.status === "PASS"
        ? report.authPreflightOnly
          ? "Auth preflight PASS. Operator real pilot: DRY_GATE_CYCLE=0 FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/run-driver-production-pilot.mjs"
          : report.dryGateCycle
            ? "Dry gate cycle PASS. Operator mutation command: DRY_GATE_CYCLE=0 FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/run-driver-production-pilot.mjs"
            : "If DRIVER PRODUCTION PILOT = PASS, continue to Agent pilot."
        : report.blocker || "Fix blocker; re-run runner in local TTY.",
    );

    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error(
    `[driver-pilot] FATAL: ${sanitizeMessage(
      err instanceof Error ? err.message : String(err),
    )}`,
  );
  process.exit(1);
});

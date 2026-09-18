#!/usr/bin/env node
/**
 * Provision synthetic Agent A+B fixtures for production write pilot.
 *
 * Strategy (canonical Admin Next APIs only — never raw Production patches):
 *   1) Auth via FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD (preferred) or muted TTY.
 *   2) Discover two inactive QA-marked agents in the same country via GET /api/agents.
 *   3) If missing: temporarily arm GLOBAL+PRODUCTION+ADMIN_IDENTITY_WRITE_ENABLED,
 *      create two personas via POST /api/users/{id}/create_persona + assign_agent_scope,
 *      set inactive via AGENT gate activate→deactivate is NOT used at provision time;
 *      instead identity create leaves actev_user unset and we POST deactivate after
 *      a brief AGENT arm only when discovery still fails after identity create.
 *   4) Write `.local/write-pilots/agent-fixture.json` (ids/country/classification only).
 *
 * Usage:
 *   FINAL_LIVE_EMAIL=info@admin.com FINAL_LIVE_PASSWORD=… node scripts/provision-agent-pilot-fixtures.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  resolveOperatorAuth,
  sanitizeAuthMessage,
  signInWithEmailPassword,
} from "./lib/driver-pilot-auth.mjs";

const ROOT = process.cwd();
const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";
const OUT_DIR = join(ROOT, ".local", "write-pilots");
const FIXTURE_PATH = join(OUT_DIR, "agent-fixture.json");
const REPORT_PATH = join(OUT_DIR, "agent-fixture-provision.json");

const QA_MARKERS = ["is_test", "functional_test", "qa_fixture", "ismndob"];
const PREFERRED_COUNTRY = "saudi_arabia";

const IDENTITY_ARM = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "ADMIN_IDENTITY_WRITE_ENABLED",
];
const AGENT_ARM = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
];
const ALL_DISARM = [
  ...new Set([
    ...IDENTITY_ARM,
    ...AGENT_ARM,
    "DRIVER_WRITE_ENABLED",
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
    "FINANCE_WRITE_ENABLED",
    "NEXT_PUBLIC_CONTROLLED_WRITES_UI",
  ]),
];

function log(msg) {
  console.log(`[agent-fixture] ${msg}`);
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
  };
}

function vercel(args) {
  return spawnSync("npx", ["vercel", ...args], {
    cwd: ROOT,
    env: { ...process.env, CI: "1" },
    encoding: "utf8",
  });
}

function setGate(key, value) {
  const res = vercel([
    "env",
    "update",
    key,
    "production",
    "--value",
    value,
    "--yes",
  ]);
  if (res.status !== 0) {
    throw new Error(
      `vercel env update ${key} failed: ${sanitizeAuthMessage(
        (res.stderr || res.stdout || "").slice(0, 200),
      )}`,
    );
  }
}

async function redeploy(label) {
  log(`redeploy Production (${label})…`);
  const res = vercel(["--prod", "--yes", "--json"]);
  if (res.status !== 0) {
    throw new Error(
      `redeploy ${label} failed: ${sanitizeAuthMessage(
        (res.stderr || res.stdout || "").slice(0, 240),
      )}`,
    );
  }
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout || "{}");
  } catch {
    parsed = null;
  }
  const id = parsed?.id || parsed?.deploymentId || null;
  log(`redeploy ${label} → ${id || "unknown"}`);
  // Wait for READY
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const insp = vercel(["inspect", id || BASE, "--json"]);
    try {
      const j = JSON.parse(insp.stdout || "{}");
      const ready =
        j?.readyState === "READY" ||
        j?.status === "READY" ||
        /Ready/i.test(insp.stdout || "");
      if (ready) {
        log(`READY ${id}`);
        return { deploymentId: id, readyState: "READY" };
      }
    } catch {
      /* continue */
    }
  }
  return { deploymentId: id, readyState: "TIMEOUT" };
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
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    return {
      httpStatus: 0,
      code: "NETWORK_ERROR",
      body: null,
      errorSafe: sanitizeAuthMessage(err instanceof Error ? err.message : String(err)),
    };
  }
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  const code =
    parsed && typeof parsed === "object"
      ? parsed.code || parsed.error || null
      : null;
  return { httpStatus: res.status, code, body: parsed };
}

function looksQa(item) {
  if (!item || typeof item !== "object") return false;
  const id = String(item.id || "");
  if (/^(test_|qa_|demo_|golden_|cp5_)/i.test(id)) return true;
  if (item.synthetic === true || item.is_test === true || item.qa_fixture === true)
    return true;
  if (item.functional_test === true) return true;
  const name = String(item.displayName || item.name || "");
  if (/qa[_ -]?fixture|admin.?next.?pilot|synthetic/i.test(name)) return true;
  return false;
}

async function listInactiveAgents(token) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ pageSize: "50", status: "inactive" });
    if (cursor) qs.set("cursor", cursor);
    const res = await requestJson(`/api/agents?${qs}`, { token });
    if (res.httpStatus !== 200) {
      throw new Error(`LIST_AGENTS_FAILED: HTTP ${res.httpStatus} ${res.code}`);
    }
    const batch = Array.isArray(res.body?.items) ? res.body.items : [];
    items.push(...batch);
    cursor = res.body?.nextCursor || null;
    if (!cursor || batch.length === 0) break;
  }
  return items;
}

function pickPair(items) {
  const byCountry = new Map();
  for (const item of items) {
    if (!looksQa(item)) continue;
    const c = String(item.countryId || "").trim();
    if (!c) continue;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c).push(item);
  }
  // Prefer preferred country with ≥2
  const preferred = byCountry.get(PREFERRED_COUNTRY) || [];
  if (preferred.length >= 2) {
    return {
      agentIdA: preferred[0].id,
      agentIdB: preferred[1].id,
      countryId: PREFERRED_COUNTRY,
      source: "discover_preferred",
    };
  }
  for (const [countryId, list] of byCountry) {
    if (list.length >= 2) {
      return {
        agentIdA: list[0].id,
        agentIdB: list[1].id,
        countryId,
        source: "discover_any",
      };
    }
  }
  return null;
}

async function createIdentityAgent(token, suffix, countryId) {
  const id = `test_adminnext_agent_${suffix}_${randomUUID().slice(0, 8)}`;
  const create = await requestJson(`/api/users/${encodeURIComponent(id)}/create_persona`, {
    method: "POST",
    token,
    body: {
      role: "country_admin",
      countryId,
      note: "Admin Next QA agent fixture — synthetic",
    },
    headers: { "idempotency-key": `prov-agent-create-${id}` },
  });
  if (create.httpStatus < 200 || create.httpStatus >= 300) {
    throw new Error(
      `CREATE_PERSONA_FAILED: HTTP ${create.httpStatus} ${create.code}`,
    );
  }
  const scope = await requestJson(
    `/api/users/${encodeURIComponent(id)}/assign_agent_scope`,
    {
      method: "POST",
      token,
      body: { countryId, agentId: id },
      headers: { "idempotency-key": `prov-agent-scope-${id}` },
    },
  );
  if (scope.httpStatus < 200 || scope.httpStatus >= 300) {
    throw new Error(
      `ASSIGN_AGENT_SCOPE_FAILED: HTTP ${scope.httpStatus} ${scope.code}`,
    );
  }
  return id;
}

async function ensureInactiveViaAgentGate(token, agentId) {
  // Best-effort: if already inactive, GET confirms; else deactivate.
  const before = await requestJson(`/api/agents/${encodeURIComponent(agentId)}`, {
    token,
  });
  const status = before.body?.status || before.body?.operationalActiveState;
  if (status === "inactive") return;
  if (status === "active" || status === "suspended" || status === "pending") {
    const action = status === "suspended" ? "deactivate" : "deactivate";
    const res = await requestJson(
      `/api/agents/${encodeURIComponent(agentId)}/${action}`,
      {
        method: "POST",
        token,
        body: { expectedCurrentState: status, reasonCode: "operational" },
        headers: { "idempotency-key": `prov-agent-deact-${agentId}` },
      },
    );
    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      throw new Error(
        `DEACTIVATE_FAILED: HTTP ${res.httpStatus} ${res.code}`,
      );
    }
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    schemaVersion: "agent-fixture-provision/v1",
    generatedAt: new Date().toISOString(),
    status: "FAIL",
    blocker: null,
    deployments: [],
    notes: [],
  };
  let gatesArmed = false;
  let exitCode = 1;
  let idToken = "";

  try {
    const firebase = resolveFirebaseClientConfig();
    if (!firebase.apiKey) throw new Error("MISSING_FIREBASE_API_KEY");

    const auth = await resolveOperatorAuth({
      env: process.env,
      firebaseConfig: { apiKey: firebase.apiKey, projectId: firebase.projectId, present: true },
      localAuthPath: join(OUT_DIR, ".final-live.json"),
      requestAuthMe: async (token) =>
        requestJson("/api/auth/me", { token }),
      promptEmail: async () =>
        String(process.env.FINAL_LIVE_EMAIL || "info@admin.com").trim(),
      promptPassword: async () => {
        throw new Error(
          "AUTH_REQUIRED: export FINAL_LIVE_PASSWORD (muted TTY unavailable in this session)",
        );
      },
    });
    idToken = auth.token || "";
    if (!idToken) {
      throw new Error(auth.blocker || "AUTH_FAILED");
    }
    log(`auth ok · method=${auth.authMethod}`);

    let pair = null;
    const inactive = await listInactiveAgents(idToken);
    report.notes.push(`inactive_listed=${inactive.length}`);
    pair = pickPair(inactive);
    if (pair) {
      report.notes.push(`discovered_pair source=${pair.source}`);
    } else {
      log("no QA pair found — provisioning via Identity APIs…");
      gatesArmed = true;
      for (const k of ALL_DISARM) setGate(k, "false");
      for (const k of IDENTITY_ARM) setGate(k, "true");
      const d1 = await redeploy("IDENTITY_ARM");
      report.deployments.push(d1.deploymentId);

      // refresh token after long deploy
      if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
        idToken = await signInWithEmailPassword(
          firebase.apiKey,
          process.env.FINAL_LIVE_EMAIL,
          process.env.FINAL_LIVE_PASSWORD,
        );
      }

      const countryId = PREFERRED_COUNTRY;
      const agentIdA = await createIdentityAgent(idToken, "a", countryId);
      const agentIdB = await createIdentityAgent(idToken, "b", countryId);
      report.notes.push(`identity_created A=${agentIdA} B=${agentIdB}`);

      // Ensure inactive via AGENT gate (identity create may leave active semantics).
      for (const k of ALL_DISARM) setGate(k, "false");
      for (const k of AGENT_ARM) setGate(k, "true");
      const d2 = await redeploy("AGENT_ARM_FOR_DEACTIVATE");
      report.deployments.push(d2.deploymentId);
      if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
        idToken = await signInWithEmailPassword(
          firebase.apiKey,
          process.env.FINAL_LIVE_EMAIL,
          process.env.FINAL_LIVE_PASSWORD,
        );
      }
      await ensureInactiveViaAgentGate(idToken, agentIdA);
      await ensureInactiveViaAgentGate(idToken, agentIdB);
      pair = {
        agentIdA,
        agentIdB,
        countryId,
        source: "identity_provision",
      };
    }

    // Live confirm
    const a = await requestJson(`/api/agents/${encodeURIComponent(pair.agentIdA)}`, {
      token: idToken,
    });
    const b = await requestJson(`/api/agents/${encodeURIComponent(pair.agentIdB)}`, {
      token: idToken,
    });
    if (a.httpStatus !== 200 || b.httpStatus !== 200) {
      throw new Error(
        `FIXTURE_CONFIRM_FAILED: A=${a.httpStatus} B=${b.httpStatus}`,
      );
    }

    const fixture = {
      schemaVersion: "write-pilot-agent-fixture/v1",
      generatedAt: new Date().toISOString(),
      agentIdA: pair.agentIdA,
      agentIdB: pair.agentIdB,
      countryId: pair.countryId || a.body?.countryId || PREFERRED_COUNTRY,
      expectedState: "inactive",
      synthetic: true,
      classification: "qa_synthetic",
      qaMarkers: QA_MARKERS,
      provisionSource: pair.source,
      status: "PASS",
    };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    report.status = "PASS";
    report.fixture = {
      agentIdA: fixture.agentIdA,
      agentIdB: fixture.agentIdB,
      countryId: fixture.countryId,
      classification: fixture.classification,
    };
    exitCode = 0;
    log(`wrote ${FIXTURE_PATH}`);
  } catch (err) {
    report.status = "FAIL";
    report.blocker = sanitizeAuthMessage(
      err instanceof Error ? err.message : String(err),
    );
    log(`FAIL: ${report.blocker}`);
    exitCode = 1;
  } finally {
    if (gatesArmed) {
      try {
        log("disarming all gates after provision…");
        for (const k of ALL_DISARM) {
          try {
            setGate(k, "false");
          } catch {
            /* ignore */
          }
        }
        // Keep DRIVER intended activation out of this script — master runner restores PASS domains.
        const d = await redeploy("PROVISION_DISARM");
        report.deployments.push(d.deploymentId);
      } catch (e) {
        report.notes.push(
          `DISARM_WARN:${sanitizeAuthMessage(
            e instanceof Error ? e.message : String(e),
          )}`,
        );
      }
    }
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    idToken = "";
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    `[agent-fixture] FATAL: ${sanitizeAuthMessage(
      err instanceof Error ? err.message : String(err),
    )}`,
  );
  process.exit(1);
});

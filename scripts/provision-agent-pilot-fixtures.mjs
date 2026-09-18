#!/usr/bin/env node
/**
 * Provision synthetic Agent A+B fixtures for production write pilot.
 *
 * Idempotent + resumable:
 *   1) Auth via FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD (preferred) or muted TTY.
 *   2) Discover existing QA-marked inactive agents in the same country.
 *   3) If missing: arm GLOBAL+PRODUCTION+ADMIN_IDENTITY_WRITE_ENABLED only
 *      (never touch DRIVER_WRITE_ENABLED), create/reuse personas via Identity APIs:
 *        Auth(operator) → create_persona → verify panel read (bounded poll) →
 *        assign_agent_scope → verify agent read → ensure inactive.
 *   4) Write `.local/write-pilots/agent-fixture.json` only when BOTH valid.
 *   5) finally: disarm Identity/Agent temp gates; restore DRIVER normal write.
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
const PARTIAL_STATE_PATH = join(OUT_DIR, "agent-fixture-partial.json");

const QA_MARKERS = ["is_test", "functional_test", "qa_fixture"];
const PREFERRED_COUNTRY = "saudi_arabia";
const ID_PREFIX = "test_adminnext_agent_";
const POLL_MS = [1000, 2000, 3000, 5000];

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
/** Temp gates only — NEVER includes DRIVER_WRITE_ENABLED. */
const TEMP_DISARM = [
  ...new Set([
    ...IDENTITY_ARM,
    ...AGENT_ARM,
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

/** Approved Driver normal write after provision finally. */
const DRIVER_NORMAL = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
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
  if (id.startsWith(ID_PREFIX)) return true;
  if (/^(test_|qa_|demo_|golden_|cp5_)/i.test(id)) return true;
  if (item.synthetic === true || item.is_test === true || item.qa_fixture === true)
    return true;
  if (item.functional_test === true) return true;
  const name = String(item.displayName || item.name || "");
  if (/qa[_ -]?fixture|admin.?next.?pilot|synthetic/i.test(name)) return true;
  return false;
}

function validateIds({ authUid, panelUserId, agentId, countryId }) {
  if (!panelUserId || typeof panelUserId !== "string") {
    throw new Error("ID_CONTRACT_FAILED: panelUserId required");
  }
  if (!agentId || typeof agentId !== "string") {
    throw new Error("ID_CONTRACT_FAILED: agentId required");
  }
  if (!countryId || typeof countryId !== "string") {
    throw new Error("ID_CONTRACT_FAILED: countryId required");
  }
  if (panelUserId !== agentId) {
    throw new Error(
      `ID_CONTRACT_FAILED: panelUserId must equal agentId for synthetic fixtures (got panel=${panelUserId.slice(0, 12)}… agent=${agentId.slice(0, 12)}…)`,
    );
  }
  if (authUid != null && authUid !== "" && authUid !== panelUserId) {
    throw new Error(
      "ID_CONTRACT_FAILED: authUid present but != panelUserId (UID contract)",
    );
  }
}

async function listAgents(token, status) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 12; page++) {
    const qs = new URLSearchParams({ pageSize: "50" });
    if (status) qs.set("status", status);
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

async function listUsers(token) {
  const res = await requestJson(`/api/users?pageSize=50`, { token });
  if (res.httpStatus !== 200) {
    return [];
  }
  return Array.isArray(res.body?.items) ? res.body.items : [];
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

function loadPartialState() {
  if (!existsSync(PARTIAL_STATE_PATH)) return { agents: [] };
  try {
    const j = JSON.parse(readFileSync(PARTIAL_STATE_PATH, "utf8"));
    return {
      agents: Array.isArray(j.agents) ? j.agents.filter((a) => a?.panelUserId) : [],
    };
  } catch {
    return { agents: [] };
  }
}

function savePartialState(agents) {
  writeFileSync(
    PARTIAL_STATE_PATH,
    `${JSON.stringify(
      {
        schemaVersion: "agent-fixture-partial/v1",
        updatedAt: new Date().toISOString(),
        agents: agents.map((a) => ({
          panelUserId: a.panelUserId,
          agentId: a.agentId,
          countryId: a.countryId,
          suffix: a.suffix,
          steps: a.steps,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

async function pollUntil(label, fn) {
  let last = null;
  for (const ms of POLL_MS) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error(
    `VERIFY_TIMEOUT: ${label} not readable after ${POLL_MS.join("/")}ms`,
  );
}

async function verifyPanelUser(token, panelUserId) {
  return pollUntil(`panel_user:${panelUserId.slice(0, 16)}`, async () => {
    const res = await requestJson(`/api/users/${encodeURIComponent(panelUserId)}`, {
      token,
    });
    if (res.httpStatus === 200 && res.body?.id === panelUserId) {
      return res.body;
    }
    return null;
  });
}

async function verifyAgent(token, agentId) {
  return pollUntil(`agent:${agentId.slice(0, 16)}`, async () => {
    const res = await requestJson(`/api/agents/${encodeURIComponent(agentId)}`, {
      token,
    });
    if (res.httpStatus === 200 && (res.body?.id === agentId || res.body?.agentId === agentId)) {
      return res.body;
    }
    return null;
  });
}

async function createOrResumeIdentityAgent(token, suffix, countryId, reusedId) {
  const panelUserId =
    reusedId || `${ID_PREFIX}${suffix}_${randomUUID().slice(0, 8)}`;
  const agentId = panelUserId;
  const steps = {
    auth: "YES",
    panel: "NO",
    persona: "NO",
    role: "NO",
    agentScope: "NO",
    agentRecord: "NO",
  };

  validateIds({ authUid: null, panelUserId, agentId, countryId });

  // Resume: panel may already exist from partial run.
  let panel = null;
  {
    const existing = await requestJson(
      `/api/users/${encodeURIComponent(panelUserId)}`,
      { token },
    );
    if (existing.httpStatus === 200 && existing.body?.id === panelUserId) {
      panel = existing.body;
      steps.panel = "YES";
      steps.persona = "YES";
      steps.role = panel.role ? "YES" : "NO";
      log(`reuse panel ${panelUserId.slice(0, 24)}… role=${panel.role || "?"}`);
    }
  }

  if (!panel) {
    const create = await requestJson(
      `/api/users/${encodeURIComponent(panelUserId)}/create_persona`,
      {
        method: "POST",
        token,
        body: {
          role: "country_admin",
          countryId,
          agentId,
          qaFixture: true,
          displayNameHint: `Admin Next QA Agent Fixture ${suffix.toUpperCase()}`,
          note: "Admin Next QA agent fixture — synthetic",
          reasonCode: "operational",
        },
        headers: { "idempotency-key": `prov-agent-create-${panelUserId}` },
      },
    );
    if (create.httpStatus < 200 || create.httpStatus >= 300) {
      throw new Error(
        `CREATE_PERSONA_FAILED: HTTP ${create.httpStatus} ${create.code}`,
      );
    }
    if (create.body?.ok === false) {
      throw new Error(
        `CREATE_PERSONA_FAILED: ${create.body?.code || "DENIED"}`,
      );
    }
    panel = await verifyPanelUser(token, panelUserId);
    steps.panel = "YES";
    steps.persona = "YES";
    steps.role = panel.role ? "YES" : "NO";
  }

  // Role + country scope already from create_persona (country_admin).
  // Assign agent scope → stamps Isagent + Rev_dloh_agent (agent domain record).
  let agent = null;
  {
    const existingAgent = await requestJson(
      `/api/agents/${encodeURIComponent(agentId)}`,
      { token },
    );
    if (
      existingAgent.httpStatus === 200 &&
      (existingAgent.body?.id === agentId ||
        existingAgent.body?.agentId === agentId)
    ) {
      agent = existingAgent.body;
      steps.agentScope = "YES";
      steps.agentRecord = "YES";
      log(`reuse agent record ${agentId.slice(0, 24)}…`);
    }
  }

  if (!agent) {
    validateIds({ authUid: null, panelUserId, agentId, countryId });
    const scope = await requestJson(
      `/api/users/${encodeURIComponent(panelUserId)}/assign_agent_scope`,
      {
        method: "POST",
        token,
        body: {
          countryId,
          agentId,
          reasonCode: "operational",
          expectedCurrentRole: "unknown",
          preconditionToken: "unknown",
        },
        headers: { "idempotency-key": `prov-agent-scope-${panelUserId}` },
      },
    );
    if (scope.httpStatus < 200 || scope.httpStatus >= 300) {
      throw new Error(
        `ASSIGN_AGENT_SCOPE_FAILED: HTTP ${scope.httpStatus} ${scope.code}`,
      );
    }
    if (scope.body?.ok === false) {
      throw new Error(
        `ASSIGN_AGENT_SCOPE_FAILED: ${scope.body?.code || "DENIED"}`,
      );
    }
    steps.agentScope = "YES";
    agent = await verifyAgent(token, agentId);
    steps.agentRecord = "YES";
  }

  // Relationship check
  const agentCountry = String(agent.countryId || "").trim();
  if (agentCountry && agentCountry !== countryId) {
    throw new Error(
      `RELATIONSHIP_FAILED: agent country ${agentCountry} != ${countryId}`,
    );
  }

  return {
    panelUserId,
    agentId,
    countryId,
    authUid: null,
    suffix,
    steps,
    status: agent.status || agent.operationalActiveState || "unknown",
  };
}

async function ensureInactiveViaAgentGate(token, agentId) {
  const before = await requestJson(`/api/agents/${encodeURIComponent(agentId)}`, {
    token,
  });
  const status = before.body?.status || before.body?.operationalActiveState;
  if (status === "inactive") return;
  if (status === "active" || status === "suspended" || status === "pending") {
    const res = await requestJson(
      `/api/agents/${encodeURIComponent(agentId)}/deactivate`,
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

async function refreshToken(firebase) {
  if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
    return signInWithEmailPassword(
      firebase.apiKey,
      process.env.FINAL_LIVE_EMAIL,
      process.env.FINAL_LIVE_PASSWORD,
    );
  }
  return "";
}

async function restoreDriverNormalWrite(report) {
  log("restoring DRIVER normal write (GLOBAL+PRODUCTION+DRIVER)…");
  for (const k of TEMP_DISARM) {
    try {
      setGate(k, "false");
    } catch {
      /* ignore */
    }
  }
  // Explicitly keep AGENT off
  setGate("AGENT_WRITE_ENABLED", "false");
  setGate("ADMIN_IDENTITY_WRITE_ENABLED", "false");
  for (const k of DRIVER_NORMAL) setGate(k, "true");
  const d = await redeploy("RESTORE_DRIVER_NORMAL");
  report.deployments.push(d.deploymentId);
  report.notes.push("driver_normal_write_restored");
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
    partialInventory: [],
    duplicates: 0,
  };
  let gatesArmed = false;
  let exitCode = 1;
  let idToken = "";

  try {
    const firebase = resolveFirebaseClientConfig();
    if (!firebase.apiKey) throw new Error("MISSING_FIREBASE_API_KEY");

    const auth = await resolveOperatorAuth({
      env: process.env,
      firebaseConfig: {
        apiKey: firebase.apiKey,
        projectId: firebase.projectId,
        present: true,
      },
      localAuthPath: join(OUT_DIR, ".final-live.json"),
      requestAuthMe: async (token) => requestJson("/api/auth/me", { token }),
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

    // Inventory existing QA candidates (no credentials).
    const inactive = await listAgents(idToken, "inactive");
    const allAgents = await listAgents(idToken, null);
    const users = await listUsers(idToken);
    const qaAgents = allAgents.filter(looksQa);
    const qaUsers = users.filter(looksQa);
    const partialDisk = loadPartialState();
    report.notes.push(`inactive_listed=${inactive.length}`);
    report.notes.push(`qa_agents_listed=${qaAgents.length}`);
    report.notes.push(`qa_users_listed=${qaUsers.length}`);
    report.notes.push(`partial_disk=${partialDisk.agents.length}`);

    for (const a of qaAgents) {
      report.partialInventory.push({
        id: a.id,
        kind: "agent",
        auth: "NO",
        panel: "UNKNOWN",
        persona: "UNKNOWN",
        role: "UNKNOWN",
        agentScope: "YES",
        agentRecord: "YES",
        status: a.status || null,
        countryId: a.countryId || null,
      });
    }
    for (const u of qaUsers) {
      if (qaAgents.some((a) => a.id === u.id)) continue;
      report.partialInventory.push({
        id: u.id,
        kind: "panel_only",
        auth: "NO",
        panel: "YES",
        persona: "YES",
        role: u.role ? "YES" : "NO",
        agentScope: "NO",
        agentRecord: "NO",
        status: u.status || null,
        countryId: (u.scopeCountryIds && u.scopeCountryIds[0]) || null,
      });
    }
    for (const p of partialDisk.agents) {
      if (report.partialInventory.some((x) => x.id === p.panelUserId)) continue;
      report.partialInventory.push({
        id: p.panelUserId,
        kind: "partial_disk",
        auth: p.steps?.auth || "UNKNOWN",
        panel: p.steps?.panel || "UNKNOWN",
        persona: p.steps?.persona || "UNKNOWN",
        role: p.steps?.role || "UNKNOWN",
        agentScope: p.steps?.agentScope || "UNKNOWN",
        agentRecord: p.steps?.agentRecord || "UNKNOWN",
        status: null,
        countryId: p.countryId || null,
      });
    }

    let pair =
      pickPair(inactive) ||
      pickPair(qaAgents.filter((a) => (a.status || "") !== "active"));
    if (pair) {
      report.notes.push(`discovered_pair source=${pair.source}`);
    } else {
      log("no QA pair found — provisioning via Identity APIs…");
      gatesArmed = true;
      for (const k of TEMP_DISARM) setGate(k, "false");
      for (const k of IDENTITY_ARM) setGate(k, "true");
      // Preserve DRIVER during identity arm (GLOBAL+PRODUCTION already true for identity).
      setGate("DRIVER_WRITE_ENABLED", "true");
      const d1 = await redeploy("IDENTITY_ARM");
      report.deployments.push(d1.deploymentId);

      idToken = (await refreshToken(firebase)) || idToken;

      const countryId = PREFERRED_COUNTRY;
      const reuseIds = [];
      // Prefer disk partials / panel-only orphans with our prefix in same country.
      for (const p of [...partialDisk.agents, ...qaUsers]) {
        const id = p.panelUserId || p.id;
        if (!id || !String(id).startsWith(ID_PREFIX)) continue;
        if (reuseIds.includes(id)) continue;
        reuseIds.push(id);
      }
      // Also scan agents that are QA but not yet a pair.
      for (const a of qaAgents) {
        if (!String(a.id).startsWith(ID_PREFIX)) continue;
        if (reuseIds.includes(a.id)) continue;
        reuseIds.push(a.id);
      }

      const created = [];
      const need = 2;
      for (let i = 0; i < need; i++) {
        const suffix = i === 0 ? "a" : "b";
        const reused = reuseIds[i] || null;
        const one = await createOrResumeIdentityAgent(
          idToken,
          suffix,
          countryId,
          reused,
        );
        created.push(one);
        savePartialState(created);
        report.notes.push(
          `identity_step ${suffix} panel=${one.steps.panel} scope=${one.steps.agentScope} agent=${one.steps.agentRecord}`,
        );
      }

      // Duplicate check: same ids must not appear twice among created.
      const idSet = new Set(created.map((c) => c.agentId));
      if (idSet.size !== created.length) {
        report.duplicates = created.length - idSet.size;
        throw new Error("DUPLICATE_QA_AGENTS: provision produced duplicate ids");
      }

      // Ensure inactive — qaFixture starts inactive; AGENT arm only if needed.
      const needsDeactivate = [];
      for (const c of created) {
        const ag = await requestJson(`/api/agents/${encodeURIComponent(c.agentId)}`, {
          token: idToken,
        });
        const st = ag.body?.status || ag.body?.operationalActiveState;
        if (st && st !== "inactive") needsDeactivate.push(c.agentId);
      }
      if (needsDeactivate.length > 0) {
        for (const k of TEMP_DISARM) setGate(k, "false");
        for (const k of AGENT_ARM) setGate(k, "true");
        setGate("DRIVER_WRITE_ENABLED", "true");
        const d2 = await redeploy("AGENT_ARM_FOR_DEACTIVATE");
        report.deployments.push(d2.deploymentId);
        idToken = (await refreshToken(firebase)) || idToken;
        for (const aid of needsDeactivate) {
          await ensureInactiveViaAgentGate(idToken, aid);
        }
      }

      pair = {
        agentIdA: created[0].agentId,
        agentIdB: created[1].agentId,
        countryId,
        source: "identity_provision",
      };
      report.notes.push(
        `identity_created A=${pair.agentIdA} B=${pair.agentIdB}`,
      );
    }

    validateIds({
      authUid: null,
      panelUserId: pair.agentIdA,
      agentId: pair.agentIdA,
      countryId: pair.countryId,
    });
    validateIds({
      authUid: null,
      panelUserId: pair.agentIdB,
      agentId: pair.agentIdB,
      countryId: pair.countryId,
    });
    if (pair.agentIdA === pair.agentIdB) {
      throw new Error("DUPLICATE_QA_AGENTS: agentIdA === agentIdB");
    }

    // Live confirm both
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
    const countryA = a.body?.countryId || pair.countryId;
    const countryB = b.body?.countryId || pair.countryId;
    if (countryA !== countryB) {
      throw new Error(
        `FIXTURE_COUNTRY_MISMATCH: A=${countryA} B=${countryB}`,
      );
    }
    const statusA = a.body?.status || a.body?.operationalActiveState;
    const statusB = b.body?.status || b.body?.operationalActiveState;
    if (statusA === "active" && statusB === "active") {
      throw new Error(
        "FIXTURE_BOTH_ACTIVE: concurrency pilot requires not both active initially",
      );
    }

    const fixture = {
      schemaVersion: "write-pilot-agent-fixture/v1",
      generatedAt: new Date().toISOString(),
      agentIdA: pair.agentIdA,
      agentIdB: pair.agentIdB,
      countryId: countryA || PREFERRED_COUNTRY,
      expectedState: "inactive",
      synthetic: true,
      classification: "qa_synthetic",
      qaMarkers: QA_MARKERS,
      provisionSource: pair.source,
      status: "PASS",
      idContracts: {
        agentIdA: { panelUserId: pair.agentIdA, agentId: pair.agentIdA, authUid: null },
        agentIdB: { panelUserId: pair.agentIdB, agentId: pair.agentIdB, authUid: null },
      },
    };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    // Clear partial once complete
    if (existsSync(PARTIAL_STATE_PATH)) {
      writeFileSync(
        PARTIAL_STATE_PATH,
        `${JSON.stringify({ schemaVersion: "agent-fixture-partial/v1", completed: true, agents: [] }, null, 2)}\n`,
      );
    }
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
        log("disarming temp Identity/Agent gates; preserving DRIVER…");
        await restoreDriverNormalWrite(report);
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

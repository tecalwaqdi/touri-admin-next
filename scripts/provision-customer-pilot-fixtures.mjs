#!/usr/bin/env node
/**
 * Provision synthetic Customer fixture for production write pilot.
 *
 * 1) Auth via FINAL_LIVE_* (never print/persist password)
 * 2) Discover existing QA-marked enabled customers via /api/customers
 * 3) If missing: arm CUSTOMER (preserve DRIVER+AGENT), POST /api/customers/qa-fixture,
 *    verify detail read, write customer-fixture.json
 * 4) finally: clear CUSTOMER if not leaving for pilot; restore DRIVER+AGENT
 *
 * Usage:
 *   FINAL_LIVE_EMAIL=info@admin.com FINAL_LIVE_PASSWORD=… \
 *     node scripts/provision-customer-pilot-fixtures.mjs
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
const FIXTURE_PATH = join(OUT_DIR, "customer-fixture.json");
const REPORT_PATH = join(OUT_DIR, "customer-fixture-provision.json");
const PREFERRED_COUNTRY = "saudi_arabia";
const ID_PREFIX = "test_adminnext_customer_";

const ARM_CUSTOMER = [
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
];
const PRESERVE = ["DRIVER_WRITE_ENABLED", "AGENT_WRITE_ENABLED"];
const CLEAR_OTHERS = [
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

function log(msg) {
  console.log(`[customer-fixture] ${msg}`);
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

function extractDeploymentId(text) {
  const clean = String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
  const m =
    clean.match(/"id"\s*:\s*"(dpl_[A-Za-z0-9]+)"/) ||
    clean.match(/\bdpl_[A-Za-z0-9]+\b/);
  return m ? m[1] || m[0] : null;
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
  const id = extractDeploymentId(`${res.stdout}\n${res.stderr}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const insp = vercel(["inspect", id || BASE, "--json"]);
    try {
      const j = JSON.parse(insp.stdout || "{}");
      const ready =
        j?.readyState === "READY" ||
        j?.deployment?.readyState === "READY" ||
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
    parsed && typeof parsed === "object" && typeof parsed.code === "string"
      ? parsed.code
      : parsed && typeof parsed === "object" && typeof parsed.error === "string"
        ? parsed.error
        : null;
  return { httpStatus: res.status, code, body: parsed };
}

function looksQa(item) {
  if (!item || typeof item !== "object") return false;
  const id = String(item.id || "");
  if (/^(test_|qa_|demo_|golden_|cp5_)/i.test(id)) return true;
  if (item.synthetic === true || item.is_test === true || item.qa_fixture === true) {
    return true;
  }
  if (String(item.emailHint || item.email || "").includes("touri-taxi-test")) {
    return true;
  }
  return false;
}

function accountEnabled(item) {
  const s = item.accountState || item.status;
  return s === "enabled" || s === "active";
}

async function discoverQaCustomer(token) {
  let cursor = null;
  for (let page = 0; page < 8; page++) {
    const qs = new URLSearchParams({ pageSize: "50" });
    if (cursor) qs.set("cursor", cursor);
    const res = await requestJson(`/api/customers?${qs}`, { token });
    if (res.httpStatus !== 200) {
      throw new Error(`CUSTOMERS_LIST_FAILED: HTTP ${res.httpStatus} ${res.code}`);
    }
    const items = Array.isArray(res.body?.items) ? res.body.items : [];
    const hit = items.find((i) => looksQa(i) && accountEnabled(i));
    if (hit) {
      return {
        customerId: hit.id,
        countryId: hit.countryId || PREFERRED_COUNTRY,
        source: "discover_list",
      };
    }
    cursor = res.body?.nextCursor || null;
    if (!cursor) break;
  }
  return null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    schemaVersion: "customer-fixture-provision/v1",
    generatedAt: new Date().toISOString(),
    status: "FAIL",
    blocker: null,
    deployments: [],
    notes: [],
    preservePassDomains: PRESERVE,
  };
  let gatesArmed = false;
  let exitCode = 1;
  let idToken = "";

  try {
    if (existsSync(FIXTURE_PATH)) {
      const existing = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
      if (existing.customerId && existing.status === "PASS") {
        report.status = "PASS";
        report.notes.push("customer-fixture.json already PASS");
        exitCode = 0;
        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
        log("fixture already present — skip");
        process.exit(0);
      }
    }

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
    if (!idToken) throw new Error(auth.blocker || "AUTH_FAILED");
    log(`auth ok · method=${auth.authMethod}`);

    let discovered = await discoverQaCustomer(idToken);
    if (discovered) {
      report.notes.push(`discovered ${discovered.customerId.slice(0, 24)}…`);
    } else {
      log("no QA customer found — provisioning via /api/customers/qa-fixture…");
      gatesArmed = true;
      for (const k of CLEAR_OTHERS) setGate(k, "false");
      for (const k of ARM_CUSTOMER) setGate(k, "true");
      for (const k of PRESERVE) setGate(k, "true");
      const d1 = await redeploy("CUSTOMER_ARM_FOR_FIXTURE");
      report.deployments.push(d1.deploymentId);

      if (process.env.FINAL_LIVE_EMAIL && process.env.FINAL_LIVE_PASSWORD) {
        idToken = await signInWithEmailPassword(
          firebase.apiKey,
          process.env.FINAL_LIVE_EMAIL,
          process.env.FINAL_LIVE_PASSWORD,
        );
      }

      const customerId = `${ID_PREFIX}a_${randomUUID().slice(0, 8)}`;
      const create = await requestJson("/api/customers/qa-fixture", {
        method: "POST",
        token: idToken,
        body: {
          customerId,
          countryId: PREFERRED_COUNTRY,
          displayNameHint: "Admin Next QA Customer Fixture A",
        },
        headers: { "idempotency-key": `prov-cust-${customerId}` },
      });
      if (create.httpStatus < 200 || create.httpStatus >= 300 || create.body?.ok === false) {
        throw new Error(
          `QA_FIXTURE_CREATE_FAILED: HTTP ${create.httpStatus} ${create.code}`,
        );
      }
      discovered = {
        customerId: create.body.customerId || customerId,
        countryId: create.body.countryId || PREFERRED_COUNTRY,
        source: "qa_fixture_api",
        created: create.body.created === true,
      };
      report.notes.push(`created=${discovered.created}`);
    }

    // Verify detail readable
    const detail = await requestJson(
      `/api/customers/${encodeURIComponent(discovered.customerId)}`,
      { token: idToken },
    );
    if (detail.httpStatus !== 200) {
      throw new Error(
        `VERIFY_DETAIL_FAILED: HTTP ${detail.httpStatus} ${detail.code}`,
      );
    }

    const fixture = {
      schemaVersion: "write-pilot-customer-fixture/v1",
      generatedAt: new Date().toISOString(),
      customerId: discovered.customerId,
      countryId: discovered.countryId || PREFERRED_COUNTRY,
      expectedState: "enabled",
      synthetic: true,
      classification: "qa_synthetic",
      qaMarkers: ["is_test", "functional_test", "qa_fixture"],
      provisionSource: discovered.source,
      status: "PASS",
    };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    report.status = "PASS";
    report.customerId = discovered.customerId;
    report.fixturePath = FIXTURE_PATH;
    exitCode = 0;
    log(`fixture written · ${discovered.customerId.slice(0, 28)}…`);
  } catch (err) {
    report.status = "FAIL";
    report.blocker = sanitizeAuthMessage(
      err instanceof Error ? err.message : String(err),
    ).slice(0, 400);
    log(`FAIL: ${report.blocker}`);
    exitCode = 1;
  } finally {
    if (gatesArmed) {
      try {
        // Leave CUSTOMER false until pilot; keep DRIVER+AGENT armed.
        setGate("CUSTOMER_WRITE_ENABLED", "false");
        for (const k of CLEAR_OTHERS) {
          try {
            setGate(k, "false");
          } catch {
            /* ignore */
          }
        }
        for (const k of [
          "GLOBAL_PRODUCTION_WRITE_ENABLED",
          "PRODUCTION_WRITE_ENABLED",
          ...PRESERVE,
        ]) {
          setGate(k, "true");
        }
        const d = await redeploy("RESTORE_PASS_CLEAR_CUSTOMER");
        report.deployments.push(d.deploymentId);
        report.notes.push("restored_driver_agent_cleared_customer");
      } catch (e) {
        report.notes.push(
          `finally_restore_err:${sanitizeAuthMessage(
            e instanceof Error ? e.message : String(e),
          ).slice(0, 120)}`,
        );
      }
    }
    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    log(`report → ${REPORT_PATH}`);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    `[customer-fixture] FATAL: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

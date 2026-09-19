#!/usr/bin/env node
/**
 * Provision geography QA fixture via POST /api/geography/qa-fixture.
 * GEOGRAPHY_RESOURCE=region|city|landmark (default landmark)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveOperatorAuth,
  sanitizeAuthMessage,
  signInWithEmailPassword,
} from "./lib/driver-pilot-auth.mjs";
import {
  OUT_DIR,
  armDomainGates,
  mustStayFalse,
  redeployProduction,
  resolvePreservePassDomains,
  restorePassDomainsClearPilot,
} from "./lib/pilot-gate-cycle.mjs";
import { DOMAIN_PILOTS } from "./lib/domain-pilot-definitions.mjs";

const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";
const resource = String(process.env.GEOGRAPHY_RESOURCE || "landmark").trim();

const defKey =
  resource === "region" ? "region" : resource === "city" ? "city" : "landmark";
const def = DOMAIN_PILOTS[defKey];
const FIXTURE_PATH = join(OUT_DIR, def.fixtureFile);

function log(msg) {
  console.log(`[geo-fixture:${resource}] ${msg}`);
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function firebaseConfig() {
  const merged = {
    ...loadDotEnvFile(join(process.cwd(), ".env.production.local")),
    ...loadDotEnvFile(join(process.cwd(), ".env.local")),
  };
  const get = (k) => {
    const raw =
      (process.env[k] && String(process.env[k]).trim()) ||
      (merged[k] && String(merged[k]).trim()) ||
      "";
    return raw.replace(/^["']|["']$/g, "");
  };
  const apiKey = get("NEXT_PUBLIC_FIREBASE_API_KEY");
  const projectId = get("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  return { apiKey, projectId, present: Boolean(apiKey) };
}

async function resolveAuth() {
  return resolveOperatorAuth({
    env: process.env,
    firebaseConfig: firebaseConfig(),
    localAuthPath: join(OUT_DIR, ".final-live.json"),
    requestAuthMe: async (token) => {
      const r = await fetch(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
      return { httpStatus: r.status };
    },
    signIn: signInWithEmailPassword,
    isTTY: false,
    promptEmail: async () => {
      throw new Error("NON_TTY");
    },
    promptPassword: async () => {
      throw new Error("NON_TTY");
    },
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(FIXTURE_PATH)) {
    log(`fixture exists → ${FIXTURE_PATH}`);
    process.exit(0);
  }

  const preserve = resolvePreservePassDomains();
  const mustFalse = mustStayFalse(def.armGates, preserve);
  let armed = false;

  try {
    const auth = await resolveAuth();
    if (!auth.token) throw new Error(auth.blocker || "AUTH_FAILED");
    log(`auth_source=${auth.authSource || auth.authMethod || "unknown"}`);

    armDomainGates(def.armGates, preserve, mustFalse, log);
    armed = true;
    await redeployProduction(`GEO_FIXTURE_ARM_${resource}`, log);

    // Fresh token after long arm deploy (cold-start / fetch failed).
    const auth2 = await resolveAuth();
    const token = auth2.token || auth.token;
    if (!token) throw new Error(auth2.blocker || "AUTH_REFRESH_FAILED");

    const suffix =
      resource === "region" ? "region_a" : resource === "city" ? "city_a" : "lm_a";
    let create = null;
    let body = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        create = await fetch(`${BASE}/api/geography/qa-fixture`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            resource,
            resourceId: `test_adminnext_${resource}_${suffix}`,
            countryId: "saudi_arabia",
          }),
          signal: AbortSignal.timeout(90000),
        });
        body = await create.json().catch(() => null);
        break;
      } catch (err) {
        lastErr = err;
        log(`qa-fixture fetch attempt ${attempt} failed — retrying…`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    if (!create) throw lastErr || new Error("fetch failed");
    if (create.status < 200 || create.status >= 300) {
      throw new Error(
        `QA_FIXTURE_FAILED: HTTP ${create.status} code=${body?.code || body?.error || "?"}`,
      );
    }

    const fixture = {
      synthetic: true,
      resource,
      resourceId: body.resourceId,
      preconditionToken: body.preconditionToken,
      countryId: "saudi_arabia",
      expectedActive: true,
    };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    log(`wrote ${FIXTURE_PATH}`);
  } catch (err) {
    console.error(
      `[geo-fixture] FAIL: ${sanitizeAuthMessage(err instanceof Error ? err.message : String(err))}`,
    );
    process.exit(1);
  } finally {
    if (armed) {
      restorePassDomainsClearPilot(def.clearOnRestore, preserve, mustFalse, log);
      await redeployProduction(`GEO_FIXTURE_RESTORE_${resource}`, log);
    }
    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }
  }
}

main();

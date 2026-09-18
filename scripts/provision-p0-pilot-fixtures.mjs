#!/usr/bin/env node
/**
 * Provision P0 QA fixture via POST /api/p0/qa-fixture.
 * P0_DOMAIN=vehicle_catalog|partner|fleet|guide
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
const domain = String(process.env.P0_DOMAIN || "vehicle_catalog").trim();
const def = DOMAIN_PILOTS[domain];
if (!def?.p0Domain) {
  console.error(`[p0-fixture] unknown P0_DOMAIN=${domain}`);
  process.exit(1);
}
const FIXTURE_PATH = join(OUT_DIR, def.fixtureFile);

function log(msg) {
  console.log(`[p0-fixture:${domain}] ${msg}`);
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
  const get = (k) => process.env[k] || merged[k] || "";
  return { apiKey: get("NEXT_PUBLIC_FIREBASE_API_KEY") };
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
    const auth = await resolveOperatorAuth({
      env: process.env,
      firebaseConfig: firebaseConfig(),
      localAuthPath: join(OUT_DIR, ".final-live.json"),
      requestAuthMe: async (token) => {
        const r = await fetch(`${BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
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
    if (!auth.token) throw new Error(auth.blocker || "AUTH_FAILED");

    armDomainGates(def.armGates, preserve, mustFalse, log);
    armed = true;
    await redeployProduction(`P0_FIXTURE_ARM_${domain}`, log);

    const idSuffix = domain.replace(/_/g, "").slice(0, 6);
    const create = await fetch(`${BASE}/api/p0/qa-fixture`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        domain: def.p0Domain,
        resourceId: `test_adminnext_${domain === "vehicle_catalog" ? "vehicle" : domain}_pilot_${idSuffix}`,
      }),
    });
    const body = await create.json().catch(() => null);
    if (create.status < 200 || create.status >= 300) {
      throw new Error(`QA_FIXTURE_FAILED: HTTP ${create.status}`);
    }

    writeFileSync(
      FIXTURE_PATH,
      `${JSON.stringify(
        {
          synthetic: true,
          domain: def.p0Domain,
          resourceId: body.resourceId,
          preconditionToken: body.preconditionToken,
          expectedActive: true,
        },
        null,
        2,
      )}\n`,
    );
    log(`wrote ${FIXTURE_PATH}`);
  } catch (err) {
    console.error(
      `[p0-fixture] FAIL: ${sanitizeAuthMessage(err instanceof Error ? err.message : String(err))}`,
    );
    process.exit(1);
  } finally {
    if (armed) {
      restorePassDomainsClearPilot(def.clearOnRestore, preserve, mustFalse, log);
      await redeployProduction(`P0_FIXTURE_RESTORE_${domain}`, log);
    }
    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }
  }
}

main();

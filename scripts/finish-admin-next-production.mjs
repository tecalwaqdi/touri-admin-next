#!/usr/bin/env node
/**
 * Master Admin Next Production completion runner.
 *
 * Resumes from current verified state:
 *   - Driver pilot PASS → skip Driver mutation (SKIP_COMPLETED_DRIVER_PILOT=1 default when driver-pass.json PASS)
 *   - Continues Agent → domains → Identity → Finance LAST
 *   - Final activation keeps PASS domain gates armed (not disarmed in finally)
 *
 * Auth: prompt once muted for info@admin.com / FINAL_LIVE_* — never print/persist password.
 *
 * Usage:
 *   FINAL_LIVE_EMAIL=info@admin.com FINAL_LIVE_PASSWORD=… node scripts/finish-admin-next-production.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  createReadStream,
  createWriteStream,
  openSync,
  closeSync,
} from "node:fs";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".local", "write-pilots");
const REPORT_PATH = join(OUT_DIR, "finish-admin-next-production.json");
const DRIVER_PASS_PATH = join(OUT_DIR, "driver-pass.json");
const AGENT_FIXTURE_PATH = join(OUT_DIR, "agent-fixture.json");
const AGENT_PASS_PATH = join(OUT_DIR, "02-agent.json");

const REMAINING_DOMAINS = [
  {
    key: "customer",
    gate: "CUSTOMER_WRITE_ENABLED",
    artifact: "03-customer.json",
    script: null,
  },
  {
    key: "region",
    gate: "REGION_WRITE_ENABLED",
    artifact: "04a-region.json",
    script: null,
  },
  {
    key: "city",
    gate: "GEOGRAPHY_WRITE_ENABLED",
    artifact: "04b-city.json",
    script: null,
  },
  {
    key: "landmark",
    gate: "GEOGRAPHY_WRITE_ENABLED",
    artifact: "04c-landmark.json",
    script: null,
  },
  {
    key: "vehicle_catalog",
    gate: "VEHICLE_CATALOG_WRITE_ENABLED",
    artifact: "05-vehicle-catalog.json",
    script: null,
  },
  {
    key: "partner",
    gate: "PARTNER_WRITE_ENABLED",
    artifact: "06-partner.json",
    script: null,
  },
  {
    key: "fleet",
    gate: "FLEET_WRITE_ENABLED",
    artifact: "07-fleet.json",
    script: null,
  },
  {
    key: "guide",
    gate: "GUIDE_WRITE_ENABLED",
    artifact: "08-guide.json",
    script: null,
  },
  {
    key: "support",
    gate: "SUPPORT_WRITE_ENABLED",
    artifact: "09-support.json",
    script: null,
  },
  {
    key: "notification",
    gate: "NOTIFICATION_WRITE_ENABLED",
    artifact: "10-notifications.json",
    script: null,
  },
  {
    key: "identity",
    gate: "ADMIN_IDENTITY_WRITE_ENABLED",
    artifact: "11-identity.json",
    script: null,
  },
  {
    key: "finance",
    gate: "FINANCE_WRITE_ENABLED",
    artifact: "12-finance.json",
    script: null,
  },
];

const ALL_WRITE_GATES = [
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

function log(msg) {
  console.log(`[finish-admin-next] ${msg}`);
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
      reject(new Error("NON_TTY: email prompt requires a controlling TTY"));
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
      reject(new Error("NON_TTY: password prompt requires a controlling TTY"));
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

function runNode(script, envExtra = {}) {
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...envExtra },
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  const combined = `${res.stdout || ""}\n${res.stderr || ""}`;
  const safe = combined
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/password["']?\s*[:=]\s*["'][^"']+/gi, "password=[redacted]");
  if (safe.trim()) {
    process.stdout.write(safe.endsWith("\n") ? safe : `${safe}\n`);
  }
  return { status: res.status ?? 1, stdout: res.stdout || "", stderr: res.stderr || "" };
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
    String(value),
    "--yes",
  ]);
  if (res.status !== 0) {
    throw new Error(`vercel env update ${key} failed`);
  }
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function driverPilotAlreadyPass() {
  const skipEnv = process.env.SKIP_COMPLETED_DRIVER_PILOT;
  if (skipEnv === "0" || skipEnv === "false") return false;
  const pass = readJsonSafe(DRIVER_PASS_PATH);
  const latest = readJsonSafe(join(OUT_DIR, "01-driver.json"));
  if (pass?.status === "PASS" && pass?.normalWriteActivated === true) return true;
  if (latest?.status === "PASS" && latest?.normalWriteActivated === true) return true;
  // User-verified: Driver production pilot PASS even if activation later cleared.
  if (pass?.status === "PASS" || latest?.status === "PASS") return true;
  if (skipEnv === "1" || skipEnv === "true") return true;
  return false;
}

function agentPilotAlreadyPass() {
  const skipEnv = process.env.SKIP_COMPLETED_AGENT_PILOT;
  if (skipEnv === "0" || skipEnv === "false") return false;
  const latest = readJsonSafe(AGENT_PASS_PATH);
  if (latest?.status === "PASS") return true;
  if (skipEnv === "1" || skipEnv === "true") return true;
  return false;
}

function writeDomainBlockedArtifact(domain) {
  const path = join(OUT_DIR, domain.artifact);
  const body = {
    schemaVersion: "write-pilot/v1",
    generatedAt: new Date().toISOString(),
    domain: domain.key.toUpperCase(),
    status: "BLOCKED_NO_DOMAIN_PILOT_HARNESS",
    pilotExecuted: false,
    gatesArmed: false,
    productionMutations: 0,
    unexpectedProductionMutations: 0,
    normalWriteActivated: false,
    saJson: 0,
    adc: 0,
    dnsTouched: false,
    notes: "No domain pilot script/fixture for Admin Next completion runner.",
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

function applyFinalGateState(passDomains) {
  log("applying final PASS gate activation…");
  for (const k of ALL_WRITE_GATES) setGate(k, "false");
  setGate("GLOBAL_PRODUCTION_WRITE_ENABLED", "true");
  setGate("PRODUCTION_WRITE_ENABLED", "true");
  for (const d of passDomains) {
    setGate(d, "true");
  }
  // UI chrome only after backend PASS domains exist
  if (passDomains.length > 0) {
    setGate("NEXT_PUBLIC_CONTROLLED_WRITES_UI", "true");
  }
  const deploy = vercel(["--prod", "--yes", "--json"]);
  return {
    deployStatus: deploy.status,
    stdoutTail: String(deploy.stdout || "").slice(-400),
    passDomains,
  };
}

async function resolveSessionCreds() {
  let email = String(process.env.FINAL_LIVE_EMAIL || "").trim();
  let password =
    process.env.FINAL_LIVE_PASSWORD != null
      ? String(process.env.FINAL_LIVE_PASSWORD)
      : "";

  const localPath = join(OUT_DIR, ".final-live.json");
  if (!email && existsSync(localPath)) {
    try {
      const local = JSON.parse(readFileSync(localPath, "utf8"));
      if (typeof local.FINAL_LIVE_EMAIL === "string") {
        email = local.FINAL_LIVE_EMAIL.trim();
      }
    } catch {
      /* ignore */
    }
  }

  if (!email) {
    email =
      (await promptLine("FINAL_LIVE_EMAIL [info@admin.com]: ")) ||
      "info@admin.com";
  }
  if (!password) {
    password = await promptPasswordMuted("FINAL_LIVE_PASSWORD (muted): ");
  }
  if (!email || !password) {
    throw new Error("AUTH_REQUIRED: email+password required once per session");
  }
  return { email, password };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    schemaVersion: "finish-admin-next/v2",
    generatedAt: new Date().toISOString(),
    phases: {},
    passDomains: [],
    status: "RUNNING",
    blocker: null,
  };

  let email = "";
  let password = "";
  let exitCode = 1;
  const passDomains = [];

  try {
    const creds = await resolveSessionCreds();
    email = creds.email;
    password = creds.password;
    process.env.FINAL_LIVE_EMAIL = email;
    process.env.FINAL_LIVE_PASSWORD = password;
    password = "";
    log(`auth session ready · email=${email} · password=[redacted]`);

    // Driver — skip mutation when already PASS
    if (driverPilotAlreadyPass()) {
      log("Phase 3: SKIP Driver mutation (already PASS) — keep DRIVER in passDomains");
      passDomains.push("DRIVER_WRITE_ENABLED");
      report.phases.phase3_driver_pilot = {
        skipped: true,
        reason: "SKIP_COMPLETED_DRIVER_PILOT",
        pass: true,
      };
    } else {
      log("Phase 3: real Driver production pilot…");
      const driver = runNode("scripts/run-driver-production-pilot.mjs", {
        DRY_GATE_CYCLE: "0",
        PILOT_NEGATIVE_PROBE_ONLY: "0",
        FINAL_LIVE_EMAIL: process.env.FINAL_LIVE_EMAIL,
        FINAL_LIVE_PASSWORD: process.env.FINAL_LIVE_PASSWORD,
      });
      report.phases.phase3_driver_pilot = {
        exitCode: driver.status,
        pass: driver.status === 0,
      };
      if (driver.status !== 0) {
        report.blocker = "PHASE3_DRIVER_PILOT_FAILED";
        throw new Error(report.blocker);
      }
      passDomains.push("DRIVER_WRITE_ENABLED");
    }

    // Agent fixtures + pilot (skip when already PASS)
    if (agentPilotAlreadyPass()) {
      log("Phase 4: SKIP Agent mutation (already PASS) — keep AGENT in passDomains");
      passDomains.push("AGENT_WRITE_ENABLED");
      report.phases.phase4_agent_pilot = {
        skipped: true,
        reason: "SKIP_COMPLETED_AGENT_PILOT",
        pass: true,
      };
      report.phases.phase4a_agent_fixtures = {
        skipped: true,
        reason: "agent pilot already PASS",
        pass: true,
      };
    } else {
      if (!existsSync(AGENT_FIXTURE_PATH)) {
        log("Phase 4a: provision agent fixtures…");
        const prov = runNode("scripts/provision-agent-pilot-fixtures.mjs", {
          FINAL_LIVE_EMAIL: process.env.FINAL_LIVE_EMAIL,
          FINAL_LIVE_PASSWORD: process.env.FINAL_LIVE_PASSWORD,
        });
        report.phases.phase4a_agent_fixtures = {
          exitCode: prov.status,
          pass: prov.status === 0,
        };
        if (prov.status !== 0) {
          report.blocker = "PHASE4A_AGENT_FIXTURE_PROVISION_FAILED";
          throw new Error(report.blocker);
        }
      } else {
        report.phases.phase4a_agent_fixtures = {
          skipped: true,
          reason: "agent-fixture.json present",
          pass: true,
        };
      }

      log("Phase 4: Agent production pilot…");
      const agent = runNode("scripts/run-agent-production-pilot.mjs", {
        DRY_GATE_CYCLE: "0",
        PILOT_NEGATIVE_PROBE_ONLY: "0",
        ACTIVATE_NORMAL_WRITE: "1",
        FINAL_LIVE_EMAIL: process.env.FINAL_LIVE_EMAIL,
        FINAL_LIVE_PASSWORD: process.env.FINAL_LIVE_PASSWORD,
      });
      report.phases.phase4_agent_pilot = {
        exitCode: agent.status,
        pass: agent.status === 0,
      };
      if (agent.status !== 0) {
        report.blocker = "PHASE4_AGENT_PILOT_FAILED";
        throw new Error(report.blocker);
      }
      passDomains.push("AGENT_WRITE_ENABLED");
    }

    // Remaining domains through Finance LAST — continue even when harness missing.
    const blocked = [];
    for (const domain of REMAINING_DOMAINS) {
      const phaseKey = `phase_${domain.key}`;
      if (domain.script && existsSync(join(ROOT, domain.script))) {
        log(`Phase ${domain.key}: running ${domain.script}…`);
        const run = runNode(domain.script, {
          FINAL_LIVE_EMAIL: process.env.FINAL_LIVE_EMAIL,
          FINAL_LIVE_PASSWORD: process.env.FINAL_LIVE_PASSWORD,
          ACTIVATE_NORMAL_WRITE: "1",
        });
        report.phases[phaseKey] = {
          exitCode: run.status,
          pass: run.status === 0,
          script: domain.script,
        };
        if (run.status !== 0) {
          report.blocker = `PHASE_${domain.key.toUpperCase()}_PILOT_FAILED`;
          throw new Error(report.blocker);
        }
        passDomains.push(domain.gate);
      } else {
        log(
          `Phase ${domain.key}: BLOCKED_NO_DOMAIN_PILOT_HARNESS — recording artifact, continuing…`,
        );
        writeDomainBlockedArtifact(domain);
        report.phases[phaseKey] = {
          pass: false,
          blocked: true,
          reason: "BLOCKED_NO_DOMAIN_PILOT_HARNESS",
        };
        blocked.push(domain.key);
      }
    }

    report.passDomains = [...new Set(passDomains)];
    report.blockedDomains = blocked;
    report.status = blocked.length === 0 ? "PASS" : "PARTIAL";
    report.notes = [
      `Driver+Agent PASS domains armed candidates: ${report.passDomains.join(",")}`,
      blocked.length
        ? `Blocked (no harness): ${blocked.join(",")} — next = Customer domain pilot harness`
        : "All domain pilots PASS",
      "Finance remains LAST once a finance harness exists.",
    ];

    // Always activate PASS domain gates after Agent+Driver (preserve Driver+Agent normal write).
    if (
      process.env.FINISH_ACTIVATE_PASS_GATES !== "0" &&
      process.env.FINISH_ACTIVATE_PASS_GATES !== "false"
    ) {
      report.finalActivation = applyFinalGateState(passDomains);
    }

    exitCode = 0;
  } catch (err) {
    report.status = "FAIL";
    report.blocker =
      report.blocker ||
      (err instanceof Error ? err.message : String(err)).slice(0, 300);
    exitCode = 1;
  } finally {
    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }
    // Do NOT disarm PASS domains here — only clear password.
    // Temporary pilot arm/disarm is owned by each domain harness try/finally.
    report.passDomains = [...new Set(passDomains)];
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    log(`report → ${REPORT_PATH}`);
    log(report.status);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    `[finish-admin-next] FATAL: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

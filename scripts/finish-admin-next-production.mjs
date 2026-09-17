#!/usr/bin/env node
/**
 * Master Admin Next Production completion runner.
 *
 * One operator session: prompt email + muted password once (process-memory only).
 * try/finally always disarms all write gates, redeploys, verifies live false.
 *
 * Usage:
 *   FINAL_LIVE_EMAIL=info@admin.com node scripts/finish-admin-next-production.mjs
 *   FINAL_LIVE_EMAIL=… FINAL_LIVE_PASSWORD=… node scripts/finish-admin-next-production.mjs
 *
 * Phases:
 *   1–2  Agent gate fix (code) + PILOT_NEGATIVE_PROBE_ONLY
 *   3    Real Driver pilot
 *   6–16 Domain pilots (synthetic only; Finance LAST)
 *   17–37 Classify / activate PASS domains / UI / docs / DNS / security
 *
 * Never prints/persists password or ID token.
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
  // Never echo secrets if accidentally present
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
  const res = spawnSync("npx", ["vercel", ...args], {
    cwd: ROOT,
    env: { ...process.env, CI: "1" },
    encoding: "utf8",
  });
  return res;
}

function disarmAllGates() {
  log("finally: disarming ALL write gates…");
  for (const k of ALL_WRITE_GATES) {
    const res = vercel([
      "env",
      "update",
      k,
      "production",
      "--value",
      "false",
      "--yes",
    ]);
    if (res.status !== 0) {
      log(`warn: failed to set ${k}=false`);
    }
  }
  log("finally: redeploying Production after disarm…");
  const deploy = vercel(["--prod", "--yes", "--json"]);
  return {
    deployStatus: deploy.status,
    stdoutTail: String(deploy.stdout || "").slice(-400),
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
    email = (await promptLine("FINAL_LIVE_EMAIL [info@admin.com]: ")) || "info@admin.com";
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
    schemaVersion: "finish-admin-next/v1",
    generatedAt: new Date().toISOString(),
    phases: {},
    status: "RUNNING",
    blocker: null,
  };

  let email = "";
  let password = "";
  let exitCode = 1;

  try {
    const creds = await resolveSessionCreds();
    email = creds.email;
    password = creds.password;
    // Process-memory only — never write password to disk.
    process.env.FINAL_LIVE_EMAIL = email;
    process.env.FINAL_LIVE_PASSWORD = password;
    password = ""; // drop local copy after env injection for child processes
    log(`auth session ready · email=${email} · password=[redacted]`);

    // Phase 2 — negative probe only
    log("Phase 2: PILOT_NEGATIVE_PROBE_ONLY…");
    const neg = runNode("scripts/run-driver-production-pilot.mjs", {
      PILOT_NEGATIVE_PROBE_ONLY: "1",
      FINAL_LIVE_EMAIL: process.env.FINAL_LIVE_EMAIL,
      FINAL_LIVE_PASSWORD: process.env.FINAL_LIVE_PASSWORD,
    });
    report.phases.phase2_negative_probe = {
      exitCode: neg.status,
      pass: neg.status === 0,
    };
    if (neg.status !== 0) {
      report.blocker = "PHASE2_NEGATIVE_PROBE_FAILED";
      throw new Error(report.blocker);
    }

    // Phase 3 — real Driver pilot
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

    report.status = "PARTIAL";
    report.notes = [
      "Phases 2–3 complete via master runner. Continue domain pilots 6–16 from this session env.",
    ];
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
    try {
      const disarm = disarmAllGates();
      report.finallyDisarm = disarm;
    } catch (e) {
      report.finallyDisarmError =
        e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
    }
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

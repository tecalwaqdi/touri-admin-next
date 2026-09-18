/**
 * Shared domain production write pilot runner (mirrors Customer/Agent harness).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  isAuthPreflightOnly,
  resolveOperatorAuth,
  sanitizeAuthMessage,
  signInWithEmailPassword,
} from "./driver-pilot-auth.mjs";
import { runAuthenticatedValidation } from "./authenticated-live-validation.mjs";
import { isCanonicalWriteBlocked403 } from "./write-probe-preflight.mjs";
import { PILOT_NOTE } from "./domain-pilot-definitions.mjs";
import {
  OUT_DIR,
  armDomainGates,
  mustStayFalse,
  redeployProduction,
  resolvePreservePassDomains,
  restorePassDomainsClearPilot,
  verifyIdentityAdminWifNotes,
  verifyOpsWifResolvable,
} from "./pilot-gate-cycle.mjs";

const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
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
  const root = process.cwd();
  const merged = {
    ...loadDotEnvFile(join(root, ".env.production.local")),
    ...loadDotEnvFile(join(root, ".env.local")),
  };
  const get = (k) =>
    (process.env[k] && String(process.env[k]).trim()) ||
    (merged[k] && String(merged[k]).trim()) ||
    "";
  return { apiKey: get("NEXT_PUBLIC_FIREBASE_API_KEY") };
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
      ? String(parsed.code)
      : parsed && typeof parsed === "object" && typeof parsed.error === "string"
        ? String(parsed.error)
        : null;
  return {
    route: path,
    method,
    httpStatus: res.status,
    code: code ? sanitizeAuthMessage(code) : null,
    body: parsed,
  };
}

async function financeNegativeProbe(token) {
  const financeProbe = await requestJson("/api/finance/settlements/probe-deny/approve", {
    method: "POST",
    token,
    body: {},
    headers: { "idempotency-key": `dom-fin-neg-${randomUUID()}` },
  });
  if (financeProbe.httpStatus >= 200 && financeProbe.httpStatus < 300) {
    throw new Error(`FINANCE_NEGATIVE_PROBE_FAILED: HTTP ${financeProbe.httpStatus}`);
  }
  return {
    httpStatus: financeProbe.httpStatus,
    code: financeProbe.code,
    blocked: true,
  };
}

async function runGeographyMutation(def, fixture, token) {
  const resource = def.geographyResource;
  const id = fixture.resourceId;
  const tokenPre = fixture.preconditionToken || "unknown";
  const path = `/api/geography/${resource}/${encodeURIComponent(id)}/deactivate`;
  const idemKey = `geo-pilot-${resource}-${randomUUID()}`;
  const write = await requestJson(path, {
    method: "POST",
    token,
    body: {
      expectedActive: true,
      preconditionToken: tokenPre,
      reasonCode: "operational",
      note: PILOT_NOTE,
    },
    headers: { "idempotency-key": idemKey },
  });
  const ok =
    write.httpStatus >= 200 &&
    write.httpStatus < 300 &&
    write.body?.productionWriteExecuted === true;
  if (!ok) {
    throw new Error(`WRITE_FAILED: HTTP ${write.httpStatus} code=${write.code}`);
  }
  const restore = await requestJson(
    `/api/geography/${resource}/${encodeURIComponent(id)}/activate`,
    {
      method: "POST",
      token,
      body: {
        expectedActive: false,
        preconditionToken: write.body?.preconditionToken || tokenPre,
        reasonCode: "operational",
        note: PILOT_NOTE,
      },
      headers: { "idempotency-key": `geo-restore-${randomUUID()}` },
    },
  );
  return { write, restore, mutationCount: 2 };
}

async function runP0Mutation(def, fixture, token) {
  const id = fixture.resourceId;
  const prefix = def.writeApiPrefix;
  if (def.guideAction) {
    const suspend = await requestJson(
      `${prefix}/${encodeURIComponent(id)}/${def.guideAction}`,
      {
        method: "POST",
        token,
        headers: {
          "idempotency-key": `guide-pilot-${randomUUID()}`,
          "x-precondition-token": fixture.preconditionToken || "unknown",
        },
        body: { reasonCode: "operational", note: PILOT_NOTE },
      },
    );
    if (suspend.httpStatus < 200 || suspend.httpStatus >= 300) {
      throw new Error(`WRITE_FAILED: HTTP ${suspend.httpStatus}`);
    }
    const restore = await requestJson(
      `${prefix}/${encodeURIComponent(id)}/${def.guideRestoreAction}`,
      {
        method: "POST",
        token,
        headers: {
          "idempotency-key": `guide-restore-${randomUUID()}`,
          "x-precondition-token": suspend.body?.preconditionToken || fixture.preconditionToken,
        },
        body: { reasonCode: "operational", note: PILOT_NOTE },
      },
    );
    return { write: suspend, restore, mutationCount: 2 };
  }
  const path = `${prefix}/${encodeURIComponent(id)}/deactivate`;
  const write = await requestJson(path, {
    method: "POST",
    token,
    headers: {
      "idempotency-key": `p0-pilot-${randomUUID()}`,
      "x-precondition-token": fixture.preconditionToken || "unknown",
    },
    body: { reasonCode: "operational", note: PILOT_NOTE },
  });
  if (write.httpStatus < 200 || write.httpStatus >= 300) {
    throw new Error(`WRITE_FAILED: HTTP ${write.httpStatus}`);
  }
  const restore = await requestJson(`${prefix}/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    token,
    headers: {
      "idempotency-key": `p0-restore-${randomUUID()}`,
      "x-precondition-token": write.body?.preconditionToken || fixture.preconditionToken,
    },
    body: { reasonCode: "operational", note: PILOT_NOTE },
  });
  return { write, restore, mutationCount: 2 };
}

async function runSupportMutation(fixture, token) {
  const id = fixture.ticketId || fixture.resourceId;
  const tokenPre = fixture.preconditionToken || "unknown";
  const write = await requestJson(`/api/support/${encodeURIComponent(id)}/add_note`, {
    method: "POST",
    token,
    body: {
      expectedPreconditionToken: tokenPre,
      noteText: PILOT_NOTE,
      reasonCode: "operational",
    },
    headers: { "idempotency-key": `support-pilot-${randomUUID()}` },
  });
  if (write.httpStatus < 200 || write.httpStatus >= 300) {
    throw new Error(`WRITE_FAILED: HTTP ${write.httpStatus}`);
  }
  return { write, mutationCount: 1 };
}

function writeArtifact(def, report) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, def.artifact);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export async function runDomainProductionPilot(def) {
  const tag = def.logTag;
  const preserve = resolvePreservePassDomains();
  const mustFalse = mustStayFalse(def.armGates, preserve);
  const artifactPath = join(OUT_DIR, def.artifact);

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
    domain: def.domainLabel,
    harnessReady: true,
    status: "FAIL",
    dryGateCycle,
    authPreflightOnly,
    preservePassDomains: preserve,
    primaryGate: def.primaryGate,
    gatesArmed: false,
    normalWriteActivated: false,
    pilotExecuted: false,
    productionMutations: 0,
    unexpectedProductionMutations: 0,
    financeNegativeProbe: null,
    notes: [],
    blocker: null,
  };

  let gatesWereArmed = false;
  let keepPassGatesArmed = false;
  let exitCode = 1;
  const firebaseConfig = resolveFirebaseClientConfig();

  try {
    if (def.blockedNoSafeFixture) {
      report.status = "HARNESS_READY";
      report.blocker = "BLOCKED_NO_SAFE_FIXTURE";
      report.notes.push(
        "Notification writes require admin_panel_notifications without client FCM tokens — no safe live fixture path.",
      );
      exitCode = 0;
      return;
    }

    if (def.syntheticStubOnly && def.financeLast) {
      report.status = "HARNESS_READY";
      report.notes.push(
        "Finance pilot LAST — synthetic FR1–FR7 stubs only; FINANCE_WRITE_ENABLED stays false until operator runbook.",
      );
      report.financeNegativeProbe = { blocked: true, syntheticStub: true };
      exitCode = 0;
      return;
    }

    log(tag, "resolving operator auth…");
    const auth = await resolveOperatorAuth({
      env: process.env,
      firebaseConfig,
      localAuthPath: join(OUT_DIR, ".final-live.json"),
      requestAuthMe: async (token) => requestJson("/api/auth/me", { token }),
      signIn: signInWithEmailPassword,
      isTTY: false,
      promptEmail: async () => {
        throw new Error("NON_TTY");
      },
      promptPassword: async () => {
        throw new Error("NON_TTY");
      },
    });
    const idToken = auth.token || "";
    report.authMethod = auth.authMethod || "none";
    if (!idToken) {
      report.blocker = auth.blocker || "AUTH_FAILED";
      throw new Error(report.blocker);
    }
    const me = await requestJson("/api/auth/me", { token: idToken });
    if (me.httpStatus !== 200) {
      report.blocker = `AUTH_ME_FAILED:HTTP_${me.httpStatus}`;
      throw new Error(report.blocker);
    }

    if (authPreflightOnly) {
      report.status = "PASS";
      report.notes.push("AUTH_PREFLIGHT_ONLY");
      exitCode = 0;
      return;
    }

    if (def.identityWifNotes) {
      report.identityWif = verifyIdentityAdminWifNotes();
      report.status = "HARNESS_READY";
      report.notes.push(...report.identityWif.notes);
      report.notes.push("Identity live mutation deferred — ident-admin WIF preflight documented.");
      exitCode = 0;
      return;
    }

    const fixturePath = def.fixtureFile
      ? join(OUT_DIR, def.fixtureFile)
      : null;
    if (!fixturePath || !existsSync(fixturePath)) {
      report.blocker = `BLOCKED_FIXTURE_MISSING: ${def.fixtureFile}`;
      throw new Error(report.blocker);
    }
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    report.fixture = fixture;

    if (def.wifRuntimeMarker) {
      verifyOpsWifResolvable(def.wifRuntimeMarker);
    } else {
      verifyOpsWifResolvable(null);
    }

    gatesWereArmed = true;
    report.gatesArmed = true;
    armDomainGates(def.armGates, preserve, mustFalse, (m) => log(tag, m));
    report.armDeployment = await redeployProduction(`ARM_${def.domainLabel}`, (m) =>
      log(tag, m),
    );

    report.financeNegativeProbe = await financeNegativeProbe(idToken);

    if (dryGateCycle) {
      report.status = "PASS";
      report.notes.push("DRY_GATE_CYCLE — mutation skipped");
      exitCode = 0;
      return;
    }

    let mutation;
    if (def.geographyResource) {
      mutation = await runGeographyMutation(def, fixture, idToken);
    } else if (def.supportMode) {
      mutation = await runSupportMutation(fixture, idToken);
    } else if (def.p0Domain) {
      mutation = await runP0Mutation(def, fixture, idToken);
    } else {
      throw new Error("DOMAIN_MUTATION_HANDLER_MISSING");
    }

    report.httpResult = mutation.write;
    report.legalRestore = mutation.restore ?? null;
    report.productionMutations = mutation.mutationCount;
    report.pilotExecuted = true;
    report.status = "PASS";
    exitCode = 0;

    if (activateNormal) {
      keepPassGatesArmed = true;
      report.normalWriteActivated = true;
      report.notes.push(`ACTIVATE_NORMAL_WRITE — retaining ${def.primaryGate}`);
    }
  } catch (err) {
    report.status = report.status === "HARNESS_READY" ? "HARNESS_READY" : "FAIL";
    report.blocker =
      report.blocker ||
      sanitizeAuthMessage(err instanceof Error ? err.message : String(err));
    log(tag, `FAIL: ${report.blocker}`);
    exitCode = 1;
  } finally {
    try {
      if (gatesWereArmed && !def.syntheticStubOnly && !def.blockedNoSafeFixture) {
        if (keepPassGatesArmed) {
          log(tag, "keeping PASS + domain gates armed");
        } else {
          restorePassDomainsClearPilot(
            def.clearOnRestore,
            preserve,
            mustFalse,
            (m) => log(tag, m),
          );
          report.disarmDeployment = await redeployProduction(
            `RESTORE_${def.domainLabel}`,
            (m) => log(tag, m),
          );
          report.gatesArmed = false;
        }
      }
    } catch (finallyErr) {
      report.notes.push(sanitizeAuthMessage(String(finallyErr)));
    }
    try {
      delete process.env.FINAL_LIVE_PASSWORD;
    } catch {
      /* ignore */
    }
    const out = writeArtifact(def, report);
    log(tag, `artifact → ${out}`);
    log(tag, report.status);
  }

  process.exit(exitCode);
}

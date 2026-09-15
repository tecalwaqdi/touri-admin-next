#!/usr/bin/env node
/**
 * Authenticated Production live validation harness (operator-driven).
 *
 * Preferred auth (no ID token paste into chat/logs):
 *   FINAL_LIVE_EMAIL=ops@example.com FINAL_LIVE_PASSWORD='…' \
 *     node scripts/final-live-validation.mjs
 *
 * Interactive (TTY only — password echo muted):
 *   node scripts/final-live-validation.mjs
 *
 * Optional override (local ephemeral only — never commit/chat):
 *   FINAL_LIVE_ID_TOKEN='…' node scripts/final-live-validation.mjs
 *
 * Firebase client config: NEXT_PUBLIC_* from process env or local
 * `.env.production.local` / `.env.local` / `.env` (not committed).
 *
 * Writes sanitized PASS/FAIL to `.local/final-live-validation.json` (gitignored).
 * ID token: memory only — never printed, never persisted, never in JSON/errors.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";

const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";

const OUT_DIR = join(process.cwd(), ".local");
const OUT_PATH = join(OUT_DIR, "final-live-validation.json");

const SAUDI_ALIASES = new Set([
  "saudi_arabia",
  "sa",
  "demo_saudi",
  "ksa",
  "السعودية",
]);

const LIST_ROUTES = [
  "/api/auth/me",
  "/api/dashboard",
  "/api/trips",
  "/api/drivers",
  "/api/customers",
  "/api/agents",
  "/api/finance/dashboard",
  "/api/finance/settlements",
  "/api/finance/corrections",
  "/api/finance/reconciliation",
  "/api/geography/countries",
  "/api/geography/cities",
  "/api/geography/landmarks",
  "/api/geography/data-quality",
  "/api/users",
  "/api/roles",
  "/api/audit",
  "/api/support",
  "/api/notifications",
];

const DETAIL_FROM_LIST = [
  { list: "/api/trips", detail: (id) => `/api/trips/${id}`, idKeys: ["id"] },
  { list: "/api/drivers", detail: (id) => `/api/drivers/${id}`, idKeys: ["id"] },
  {
    list: "/api/customers",
    detail: (id) => `/api/customers/${id}`,
    idKeys: ["id"],
  },
  { list: "/api/agents", detail: (id) => `/api/agents/${id}`, idKeys: ["id"] },
  {
    list: "/api/geography/landmarks",
    detail: (id) => `/api/geography/landmarks/${id}`,
    idKeys: ["landmarkId", "id"],
  },
  {
    list: "/api/geography/cities",
    detail: (id) => `/api/geography/cities/${id}`,
    idKeys: ["cityId", "id"],
  },
  {
    list: "/api/geography/countries",
    detail: (id) => `/api/geography/countries/${id}`,
    idKeys: ["countryId", "id"],
  },
  { list: "/api/users", detail: (id) => `/api/users/${id}`, idKeys: ["id"] },
  {
    list: "/api/audit",
    detail: (id) => `/api/audit/${id}`,
    idKeys: ["auditId", "id"],
  },
  {
    list: "/api/support",
    detail: (id) => `/api/support/${id}`,
    idKeys: ["id"],
  },
  {
    list: "/api/finance/settlements",
    detail: (id) => `/api/finance/settlements/${id}`,
    idKeys: ["id", "settlementId"],
  },
];

/** Allowed top-level keys in the sanitized artifact (deny-by-default). */
const ARTIFACT_KEYS = new Set([
  "generatedAt",
  "baseUrl",
  "mode",
  "authMethod",
  "tokenPresent",
  "firebaseConfigPresent",
  "checklist",
  "results",
  "failedRoutes",
  "geographySaudiFilter",
  "writeBlockProbe",
  "productionMutations",
  "tokenPrinted",
  "tokenPersisted",
  "summary",
  "blocker",
]);

function sanitizeMessage(value) {
  if (value == null) return null;
  let s = String(value);
  // Strip anything that looks like a JWT / bearer token / password-ish blob.
  s = s.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    "[redacted-jwt]",
  );
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  s = s.replace(/idToken["']?\s*[:=]\s*["'][^"']+/gi, "idToken=[redacted]");
  s = s.replace(/password["']?\s*[:=]\s*["'][^"']+/gi, "password=[redacted]");
  if (s.length > 400) s = `${s.slice(0, 400)}…`;
  return s;
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
    join(process.cwd(), ".env.production.local"),
    join(process.cwd(), ".env.local"),
    join(process.cwd(), ".env"),
  ];
  const merged = {};
  for (const f of files) {
    Object.assign(merged, loadDotEnvFile(f));
  }
  const get = (k) =>
    (process.env[k] && String(process.env[k]).trim()) ||
    (merged[k] && String(merged[k]).trim()) ||
    "";
  const apiKey = get("NEXT_PUBLIC_FIREBASE_API_KEY");
  const authDomain = get("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId = get("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const appId = get("NEXT_PUBLIC_FIREBASE_APP_ID");
  const messagingSenderId = get("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  const storageBucket = get("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId,
    storageBucket,
    present: Boolean(apiKey && projectId),
  };
}

function promptLine(question) {
  return new Promise((resolve, reject) => {
    if (!stdinStream.isTTY) {
      reject(new Error("NON_TTY: interactive email prompt requires a TTY"));
      return;
    }
    const rl = createInterface({ input: stdinStream, output: stdoutStream });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function promptPasswordMuted(question) {
  return new Promise((resolve, reject) => {
    if (!stdinStream.isTTY) {
      reject(new Error("NON_TTY: interactive password prompt requires a TTY"));
      return;
    }
    stdoutStream.write(question);
    const wasRaw = stdinStream.isRaw;
    stdinStream.setRawMode?.(true);
    stdinStream.resume();
    let password = "";
    const onData = (buf) => {
      const char = buf.toString("utf8");
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdinStream.removeListener("data", onData);
        stdinStream.setRawMode?.(wasRaw ?? false);
        stdinStream.pause();
        stdoutStream.write("\n");
        resolve(password);
        return;
      }
      if (char === "\u0003") {
        stdinStream.removeListener("data", onData);
        stdinStream.setRawMode?.(wasRaw ?? false);
        stdoutStream.write("\n");
        reject(new Error("Interrupted"));
        return;
      }
      if (char === "\u007f" || char === "\b") {
        password = password.slice(0, -1);
        return;
      }
      // Ignore ANSI / control sequences; append printable.
      if (char.length === 1 && char >= " ") {
        password += char;
      }
    };
    stdinStream.on("data", onData);
  });
}

/**
 * Sign in with email/password against Firebase Identity Toolkit.
 * Returns idToken in memory only. Never logs credentials or token.
 */
async function signInWithEmailPassword(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code =
      body && typeof body === "object" && body.error && body.error.message
        ? String(body.error.message)
        : `HTTP_${res.status}`;
    // Do not include email/password/response body (may echo email).
    throw new Error(`FIREBASE_AUTH_FAILED:${sanitizeMessage(code)}`);
  }
  const idToken =
    body && typeof body === "object" && typeof body.idToken === "string"
      ? body.idToken
      : "";
  if (!idToken) {
    throw new Error("FIREBASE_AUTH_FAILED:missing_id_token");
  }
  return idToken;
}

async function resolveIdToken(firebaseConfig) {
  const envToken = process.env.FINAL_LIVE_ID_TOKEN?.trim() || "";
  if (envToken) {
    return { token: envToken, authMethod: "id_token_env" };
  }

  let email = process.env.FINAL_LIVE_EMAIL?.trim() || "";
  let password = process.env.FINAL_LIVE_PASSWORD || "";

  if (!email || !password) {
    if (!stdinStream.isTTY) {
      return {
        token: "",
        authMethod: "none",
        blocker:
          "No FINAL_LIVE_EMAIL/FINAL_LIVE_PASSWORD (or FINAL_LIVE_ID_TOKEN) in env, and stdin is non-TTY. Run interactively in a local terminal, or export ephemeral FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD for one run only.",
      };
    }
    if (!email) {
      email = await promptLine("FINAL_LIVE_EMAIL: ");
    }
    if (!password) {
      password = await promptPasswordMuted("FINAL_LIVE_PASSWORD (muted): ");
    }
  }

  if (!email || !password) {
    return {
      token: "",
      authMethod: "none",
      blocker: "Email/password empty after prompt/env.",
    };
  }
  if (!firebaseConfig.present || !firebaseConfig.apiKey) {
    return {
      token: "",
      authMethod: "none",
      blocker:
        "NEXT_PUBLIC_FIREBASE_API_KEY (and project) missing from env / .env.production.local / .env.local.",
    };
  }

  const token = await signInWithEmailPassword(
    firebaseConfig.apiKey,
    email,
    password,
  );
  // Drop password reference ASAP (best-effort; JS string immutability).
  password = "";
  email = "";
  return { token, authMethod: "email_password" };
}

function classifySource(body) {
  if (!body || typeof body !== "object") return "unknown";
  if (body.sourceLabel?.label) return String(body.sourceLabel.label);
  if (body.synthetic === true) return "synthetic";
  if (body.unavailable === true) return "unavailable";
  if (body.label === "development_synthetic") return "development_synthetic";
  return "production_or_unlabeled";
}

function isProductionishSource(classification) {
  return (
    classification === "production" ||
    classification === "production_pilot" ||
    classification === "production_or_unlabeled"
  );
}

function extractItemId(item, idKeys) {
  if (!item || typeof item !== "object") return null;
  for (const k of idKeys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function firstListId(body, idKeys) {
  const items = body && Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    const id = extractItemId(item, idKeys);
    if (id) return id;
  }
  return null;
}

function isSaudiLandmark(item) {
  if (!item || typeof item !== "object") return false;
  const fields = [
    item.canonicalCountryId,
    item.countryId,
    item.countryDocId,
    item.sourceCountryDocumentId,
  ];
  return fields.some((f) => {
    if (typeof f !== "string") return false;
    const n = f.trim().toLowerCase();
    return SAUDI_ALIASES.has(n) || n.includes("saudi");
  });
}

async function requestJson(path, { method = "GET", token = "", body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  } catch (err) {
    return {
      route: path,
      method,
      httpStatus: 0,
      pass: false,
      sourceClassification: "unknown",
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
      ? parsed.code
      : parsed && typeof parsed === "object" && typeof parsed.error === "string"
        ? parsed.error
        : null;
  return {
    route: path,
    method,
    httpStatus: res.status,
    pass: false, // caller sets
    sourceClassification: classifySource(parsed),
    code: code ? sanitizeMessage(code) : null,
    errorSafe: null,
    body: parsed,
  };
}

function publicResult(probe) {
  return {
    route: probe.route,
    method: probe.method || "GET",
    httpStatus: probe.httpStatus,
    pass: probe.pass,
    sourceClassification: probe.sourceClassification,
    code: probe.code,
    ...(probe.errorSafe ? { errorSafe: probe.errorSafe } : {}),
    ...(probe.note ? { note: probe.note } : {}),
  };
}

function pickArtifact(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (ARTIFACT_KEYS.has(k)) out[k] = obj[k];
  }
  return out;
}

async function main() {
  const firebaseConfig = resolveFirebaseClientConfig();
  let idToken = "";
  let authMethod = "none";
  let blocker = null;
  let tokenPrinted = false;
  let tokenPersisted = false;

  try {
    const auth = await resolveIdToken(firebaseConfig);
    idToken = auth.token || "";
    authMethod = auth.authMethod || "none";
    if (auth.blocker) blocker = auth.blocker;
  } catch (err) {
    blocker = sanitizeMessage(err instanceof Error ? err.message : String(err));
    authMethod = "none";
    idToken = "";
  }

  const mode = idToken ? "authenticated" : "unauthenticated_fail_closed";
  const results = [];
  const failedRoutes = [];

  const expectAuthOk = (probe, opts = {}) => {
    const { requireProductionSource = false, allowEmpty = true } = opts;
    const okStatus = probe.httpStatus >= 200 && probe.httpStatus < 300;
    const not500 = probe.httpStatus !== 500;
    const notSynthetic =
      probe.sourceClassification !== "synthetic" &&
      probe.sourceClassification !== "development_synthetic";
    let pass = Boolean(idToken) ? okStatus && not500 && notSynthetic : false;
    if (requireProductionSource && pass) {
      pass = isProductionishSource(probe.sourceClassification);
    }
    if (!allowEmpty && pass) {
      const items = probe.body?.items;
      pass = Array.isArray(items); // emptiness OK for some lists; structure required
    }
    probe.pass = pass;
    // Drop body before recording (never persist response payloads that may hold PII).
    const pub = publicResult(probe);
    results.push(pub);
    if (!pass) failedRoutes.push(probe.route);
    return probe;
  };

  // --- List / core authenticated routes ---
  const listBodies = new Map();
  if (idToken) {
    for (const route of LIST_ROUTES) {
      const probe = await requestJson(route, { token: idToken });
      // auth/me and roles may be unlabeled; still require 2xx + not synthetic
      const requireProductionSource = [
        "/api/users",
        "/api/audit",
        "/api/support",
        "/api/notifications",
        "/api/trips",
        "/api/drivers",
        "/api/customers",
        "/api/agents",
        "/api/geography/countries",
        "/api/geography/cities",
        "/api/geography/landmarks",
        "/api/finance/dashboard",
        "/api/finance/settlements",
        "/api/finance/corrections",
      ].includes(route);
      expectAuthOk(probe, { requireProductionSource });
      listBodies.set(route, probe.body);
    }
  } else {
    // Fail-closed unauthenticated probe (still useful for harness health).
    for (const route of LIST_ROUTES) {
      const probe = await requestJson(route, { token: "" });
      probe.pass =
        probe.httpStatus === 401 ||
        probe.httpStatus === 403 ||
        (route === "/api/auth/me" &&
          (probe.httpStatus === 401 || probe.httpStatus === 403));
      results.push(publicResult(probe));
      if (!probe.pass) failedRoutes.push(probe.route);
    }
  }

  // --- Detail routes from list IDs (safe, real IDs only) ---
  if (idToken) {
    for (const spec of DETAIL_FROM_LIST) {
      const id = firstListId(listBodies.get(spec.list), spec.idKeys);
      if (!id) {
        results.push({
          route: `${spec.detail("<missing>")}`,
          method: "GET",
          httpStatus: 0,
          pass: true,
          sourceClassification: "skipped",
          code: "NO_LIST_ID",
          note: "List empty or id absent — skipped (not a failure)",
        });
        continue;
      }
      const path = spec.detail(encodeURIComponent(id));
      const probe = await requestJson(path, { token: idToken });
      expectAuthOk(probe, { requireProductionSource: false });
    }

    // Intentional 404
    {
      const probe = await requestJson(
        "/api/trips/__final_live_missing_id__",
        { token: idToken },
      );
      probe.pass =
        probe.httpStatus === 404 &&
        (probe.body?.code === "NOT_FOUND" ||
          probe.body?.code == null ||
          String(probe.body?.code).toUpperCase() === "NOT_FOUND");
      probe.note = "intentional missing detail id — expect 404 NOT_FOUND";
      results.push(publicResult(probe));
      if (!probe.pass) failedRoutes.push(probe.route);
    }
  }

  // --- Geography Saudi filter ---
  let geographySaudiFilter = {
    pass: false,
    unfilteredSaudiCount: 0,
    filteredCount: 0,
    retainedVisible: false,
    note: null,
  };
  if (idToken) {
    const unfiltered =
      listBodies.get("/api/geography/landmarks") ||
      (await requestJson("/api/geography/landmarks", { token: idToken })).body;
    const filteredProbe = await requestJson(
      "/api/geography/landmarks?countryId=saudi_arabia",
      { token: idToken },
    );
    const unfilteredItems = Array.isArray(unfiltered?.items)
      ? unfiltered.items
      : [];
    const filteredItems = Array.isArray(filteredProbe.body?.items)
      ? filteredProbe.body.items
      : [];
    const saudiInUnfiltered = unfilteredItems.filter(isSaudiLandmark);
    const saudiIds = new Set(
      saudiInUnfiltered
        .map((i) => extractItemId(i, ["landmarkId", "id"]))
        .filter(Boolean),
    );
    const retainedVisible =
      saudiIds.size === 0
        ? filteredProbe.httpStatus >= 200 &&
          filteredProbe.httpStatus < 300 &&
          !["synthetic", "development_synthetic"].includes(
            filteredProbe.sourceClassification,
          )
        : [...saudiIds].some((id) =>
            filteredItems.some(
              (i) => extractItemId(i, ["landmarkId", "id"]) === id,
            ),
          ) || filteredItems.some(isSaudiLandmark);

    const pass =
      filteredProbe.httpStatus >= 200 &&
      filteredProbe.httpStatus < 300 &&
      filteredProbe.httpStatus !== 500 &&
      !["synthetic", "development_synthetic"].includes(
        filteredProbe.sourceClassification,
      ) &&
      retainedVisible &&
      (saudiIds.size === 0 || filteredItems.length > 0);

    geographySaudiFilter = {
      pass,
      unfilteredSaudiCount: saudiIds.size,
      filteredCount: filteredItems.length,
      retainedVisible,
      note:
        saudiIds.size === 0
          ? "No Saudi landmarks on first unfiltered page; filter request still 2xx + non-synthetic"
          : "Saudi landmarks from unfiltered page remain visible under countryId=saudi_arabia",
    };
    filteredProbe.pass = pass;
    filteredProbe.note = geographySaudiFilter.note;
    results.push(publicResult(filteredProbe));
    if (!pass) failedRoutes.push(filteredProbe.route);
  }

  // --- Write-zero probe (must deny; zero production mutations) ---
  const writeProbe = await requestJson("/api/drivers/probe/approve", {
    method: "POST",
    token: idToken || "",
    body: {},
  });
  const writeBlocked =
    writeProbe.httpStatus === 403 &&
    (writeProbe.code === "PRODUCTION_WRITE_DISABLED" ||
      writeProbe.body?.error === "PRODUCTION_WRITE_DISABLED");
  writeProbe.pass = writeBlocked;
  writeProbe.note = "write-zero probe";
  results.push(publicResult(writeProbe));
  if (!writeProbe.pass) failedRoutes.push(writeProbe.route);

  const productionMutations = writeBlocked ? 0 : writeProbe.httpStatus >= 200 && writeProbe.httpStatus < 300 ? 1 : 0;

  // --- Checklist aggregation ---
  const byRoute = (prefix) =>
    results.filter((r) => r.route === prefix || r.route.startsWith(prefix));

  const allPass = (routes) =>
    routes.every((r) => r.pass) && routes.length > 0;

  const authMe = byRoute("/api/auth/me");
  const users = byRoute("/api/users");
  const audit = byRoute("/api/audit");
  const support = byRoute("/api/support");
  const notifications = byRoute("/api/notifications");
  const finance = results.filter((r) => r.route.startsWith("/api/finance"));
  const detailRoutes = results.filter((r) =>
    /\/api\/(trips|drivers|customers|agents|users|audit|support|geography\/(landmarks|cities|countries)|finance\/settlements)\/[^/?]+$/.test(
      r.route,
    ),
  );

  const checklist = {
    AUTH_ME: idToken ? allPass(authMe) : false,
    USERS: idToken ? allPass(users.filter((r) => r.route === "/api/users")) : false,
    AUDIT: idToken ? allPass(audit.filter((r) => r.route === "/api/audit")) : false,
    SUPPORT: idToken
      ? allPass(support.filter((r) => r.route === "/api/support"))
      : false,
    NOTIFICATIONS: idToken
      ? allPass(notifications.filter((r) => r.route === "/api/notifications"))
      : false,
    GEOGRAPHY_SAUDI_FILTER: geographySaudiFilter.pass,
    FINANCE: idToken ? finance.filter((r) => r.method !== "POST").every((r) => r.pass) && finance.length > 0 : false,
    DETAIL_ROUTES: idToken
      ? detailRoutes.every((r) => r.pass || r.code === "NO_LIST_ID")
      : false,
    WRITE_BLOCK_PROBE: writeBlocked,
    PRODUCTION_MUTATIONS_ZERO: productionMutations === 0,
    FAILED_ROUTES_NONE: failedRoutes.length === 0 && Boolean(idToken),
    SANITIZED_ARTIFACT: true,
    TOKEN_PRINTED: tokenPrinted,
    TOKEN_PERSISTED: tokenPersisted,
  };

  const authenticatedPass =
    Boolean(idToken) &&
    checklist.AUTH_ME &&
    checklist.USERS &&
    checklist.AUDIT &&
    checklist.SUPPORT &&
    checklist.NOTIFICATIONS &&
    checklist.GEOGRAPHY_SAUDI_FILTER &&
    checklist.FINANCE &&
    checklist.DETAIL_ROUTES &&
    checklist.WRITE_BLOCK_PROBE &&
    checklist.PRODUCTION_MUTATIONS_ZERO &&
    checklist.FAILED_ROUTES_NONE &&
    !tokenPrinted &&
    !tokenPersisted;

  if (!idToken && !blocker) {
    blocker =
      "Authenticated live validation requires FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD (ephemeral) or interactive TTY login.";
  }

  const artifact = pickArtifact({
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode,
    authMethod,
    tokenPresent: Boolean(idToken),
    firebaseConfigPresent: firebaseConfig.present,
    checklist,
    results,
    failedRoutes: [...new Set(failedRoutes)],
    geographySaudiFilter,
    writeBlockProbe: {
      route: "/api/drivers/probe/approve",
      httpStatus: writeProbe.httpStatus,
      code: writeProbe.code,
      pass: writeBlocked,
    },
    productionMutations,
    tokenPrinted,
    tokenPersisted,
    summary: {
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
      total: results.length,
      authenticatedLiveValidation: authenticatedPass ? "PASS" : "FAIL",
    },
    blocker: blocker || null,
  });

  // Scrub any accidental secret-looking strings before write.
  const artifactJson = JSON.stringify(artifact, null, 2).replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    "[redacted-jwt]",
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, artifactJson + "\n", "utf8");
  tokenPersisted = false; // we never wrote the token

  // Clear token from memory before any further logging.
  idToken = "";

  const verdict = authenticatedPass ? "PASS" : "FAIL";
  console.log(
    `AUTHENTICATED LIVE VALIDATION: ${verdict} · wrote sanitized ${OUT_PATH} (${artifact.summary.pass}/${artifact.summary.total} checks). Token never printed.`,
  );
  console.log(
    [
      `AUTH ME: ${checklist.AUTH_ME ? "PASS" : "FAIL"}`,
      `USERS: ${checklist.USERS ? "PASS" : "FAIL"}`,
      `AUDIT: ${checklist.AUDIT ? "PASS" : "FAIL"}`,
      `SUPPORT: ${checklist.SUPPORT ? "PASS" : "FAIL"}`,
      `NOTIFICATIONS: ${checklist.NOTIFICATIONS ? "PASS" : "FAIL"}`,
      `GEOGRAPHY SAUDI FILTER: ${checklist.GEOGRAPHY_SAUDI_FILTER ? "PASS" : "FAIL"}`,
      `FINANCE: ${checklist.FINANCE ? "PASS" : "FAIL"}`,
      `DETAIL ROUTES: ${checklist.DETAIL_ROUTES ? "PASS" : "FAIL"}`,
      `WRITE BLOCK PROBE: ${checklist.WRITE_BLOCK_PROBE ? "PASS" : "FAIL"}`,
      `PRODUCTION MUTATIONS: ${productionMutations}`,
      `FAILED ROUTES: ${artifact.failedRoutes.length ? artifact.failedRoutes.join(",") : "none"}`,
      `SANITIZED ARTIFACT: YES`,
      `TOKEN PRINTED: NO`,
      `TOKEN PERSISTED: NO`,
    ].join(" · "),
  );
  if (blocker) {
    console.log(`BLOCKER: ${blocker}`);
  }
  if (!authenticatedPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(sanitizeMessage(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});

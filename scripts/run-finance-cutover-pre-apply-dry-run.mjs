/**
 * Authenticated Production cutover inventory dry-run (NO WRITES).
 * Uses operator auth (keychain / FINAL_LIVE_*). Never prints tokens.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import {
  resolveOperatorAuth,
  signInWithEmailPassword,
  DEFAULT_OPERATOR_EMAIL,
} from "./lib/driver-pilot-auth.mjs";

const BASE =
  process.env.ADMIN_NEXT_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";

function resolveFirebaseClientConfig(env = process.env) {
  const apiKey = String(env.NEXT_PUBLIC_FIREBASE_API_KEY || "").trim();
  const projectId = String(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  return {
    present: Boolean(apiKey && projectId),
    apiKey,
    projectId,
  };
}

function loadDotEnvFiles() {
  for (const path of [".env.production.local", ".env.local"]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2] ?? "";
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }
}

loadDotEnvFiles();
// Hard safety for census-only
process.env.FINANCE_WRITE_ENABLED = "false";
process.env.FINANCE_CUTOVER_APPROVED = "false";
process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
process.env.PRODUCTION_WRITE_ENABLED = "false";

async function requestJson(path, { method = "GET", token = "", body, timeoutMs = 60000 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 4000) };
  }
  return { status: res.status, json };
}

async function main() {
  if (process.env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error("Refuse: FINANCE_WRITE_ENABLED must be false");
  }
  if (process.env.FINANCE_CUTOVER_APPROVED === "true") {
    throw new Error("Refuse: FINANCE_CUTOVER_APPROVED must remain false for census-only");
  }

  const firebaseConfig = resolveFirebaseClientConfig(process.env);
  console.error(
    `firebase_config_present=${firebaseConfig.present ? "yes" : "no"}`,
  );

  const auth = await resolveOperatorAuth({
    email: process.env.FINAL_LIVE_EMAIL || DEFAULT_OPERATOR_EMAIL,
    password: process.env.FINAL_LIVE_PASSWORD,
    idToken: process.env.FINAL_LIVE_ID_TOKEN,
    env: process.env,
    firebaseConfig,
    requestAuthMe: async (token) => requestJson("/api/auth/me", { token }),
    signIn: signInWithEmailPassword,
    isTTY: Boolean(process.stdin.isTTY),
  });

  const token = auth?.token || "";
  console.error(`auth_source=${auth?.authSource || "none"}`);
  console.error(`auth_method=${auth?.authMethod || "none"}`);
  if (auth?.blocker) console.error(`auth_blocker=${auth.blocker}`);
  if (Array.isArray(auth?.notes) && auth.notes.length) {
    console.error(`auth_notes=${auth.notes.join("|")}`);
  }
  if (!token) {
    console.error("AUTH_FAILED");
    process.exit(3);
  }

  const me = await requestJson("/api/auth/me", { token });
  console.error(`auth_me_status=${me.status}`);
  if (me.status !== 200) {
    console.error("AUTH_ME_FAILED");
    process.exit(3);
  }

  console.error("census_start");
  const result = await requestJson("/api/finance/cutover/inventory-dry-run", {
    method: "POST",
    token,
    timeoutMs: 280000,
    body: {
      cutoverDate: "2026-10-01",
      timezone: "Asia/Riyadh",
      fullCensus: true,
      includeExtraCollections: true,
      maxPagesPerCollection: 200,
    },
  });
  console.error(`census_http_status=${result.status}`);

  writeFileSync(
    ".local/finance-cutover-full-census.json",
    JSON.stringify(result.json, null, 2),
  );

  const j = result.json;
  const summary = {
    status: result.status,
    dryRun: j.dryRun,
    productionWrites: j.productionWrites,
    deletions: j.deletions,
    financeWriteEnabled: j.financeWriteEnabled ?? false,
    cutoverApproved: false,
    cutover: j.cutover,
    scannedByCollection: j.census?.scannedByCollection,
    scanComplete: j.census?.scanComplete,
    productionReads: j.census?.productionReads,
    scans: (j.census?.scans || []).map((s) => ({
      collection: s.collection,
      pages: s.pages,
      docs: s.docs,
      scanComplete: s.scanComplete,
      truncatedByPageCap: s.truncatedByPageCap,
      idSample: (s.idSample || []).slice(0, 25),
    })),
    counts: j.counts,
    unclassifiedIds: j.idsByClass?.UNCLASSIFIED || [],
    idsByClass: Object.fromEntries(
      Object.entries(j.idsByClass || {}).map(([k, v]) => [
        k,
        Array.isArray(v) ? v : [],
      ]),
    ),
    opening: {
      drivers: j.openingBalances?.driverOpeningBalances || [],
      agents: j.openingBalances?.agentOpeningBalances || [],
      company: j.openingBalances?.companyNetOpening,
      unresolved: j.openingBalances?.unresolved || [],
    },
    qa: {
      candidates: j.qaDeleteManifest?.entries || [],
      realToDelete: j.qaDeleteManifest?.realRecordsToDelete ?? 0,
      heuristicOnlyExcluded: j.qaDeleteManifest?.heuristicOnlyExcluded || [],
    },
    financialImpact: j.financialImpact
      ? {
          totalRecords: j.financialImpact.totalRecords,
          unclassified: j.financialImpact.unclassified,
          counts: j.financialImpact.counts,
          idsByClass: j.financialImpact.idsByClass,
          walletSummary: j.financialImpact.walletSummary,
          wallets: {
            reviewed: j.financialImpact.wallets?.reviewed || [],
            nonzeroReal: j.financialImpact.wallets?.nonzeroReal || [],
            conflicts: j.financialImpact.wallets?.conflicts || [],
          },
          settlementChains: {
            fullySettled: j.financialImpact.settlementChains?.fullySettled,
            unresolved: j.financialImpact.settlementChains?.unresolved,
            chains: j.financialImpact.settlementChains?.chains || [],
          },
          orders: j.financialImpact.orders,
          malformed: {
            resolvedIds: (j.financialImpact.malformed?.resolved || []).map(
              (r) => r.id,
            ),
            blockerIds: (j.financialImpact.malformed?.blockers || []).map(
              (r) => r.id,
            ),
            details: j.financialImpact.malformed?.details || [],
          },
          openingBalances: j.financialImpact.openingBalances,
          unresolvedMoney: j.financialImpact.unresolvedMoney,
          syntheticDeleteManifest: j.financialImpact.syntheticDeleteManifest,
          blockers: j.financialImpact.blockers,
          readyForCutoverApply: j.financialImpact.readyForCutoverApply,
          maintenanceSequenceDefinedNotExecuted:
            j.financialImpact.maintenanceSequenceDefinedNotExecuted,
        }
      : null,
    blockers: j.safety?.blockers || [],
    readyForCutoverApply: j.readyForCutoverApply ?? false,
  };

  writeFileSync(
    ".local/finance-cutover-full-census-summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (result.status !== 200) process.exit(2);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});

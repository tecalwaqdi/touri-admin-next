#!/usr/bin/env node
/**
 * Authenticated live validation harness (operator-driven).
 *
 * Usage (after normal browser login — do NOT paste tokens into chat):
 *   FINAL_LIVE_BASE_URL=https://touri-admin-next.vercel.app \
 *   FINAL_LIVE_ID_TOKEN="...(from browser session only; never commit)..." \
 *   node scripts/final-live-validation.mjs
 *
 * Writes sanitized PASS/FAIL to `.local/final-live-validation.json` (gitignored).
 * Never prints or persists the bearer token.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";
const TOKEN = process.env.FINAL_LIVE_ID_TOKEN?.trim() || "";

const ROUTES = [
  "/api/auth/me",
  "/api/dashboard",
  "/api/trips",
  "/api/drivers",
  "/api/customers",
  "/api/agents",
  "/api/finance/dashboard",
  "/api/settlements",
  "/api/finance/corrections",
  "/api/geography/countries",
  "/api/geography/cities",
  "/api/geography/landmarks",
  "/api/users",
  "/api/roles",
  "/api/audit",
  "/api/support",
  "/api/notifications",
];

function classifySource(body) {
  if (!body || typeof body !== "object") return "unknown";
  if (body.sourceLabel?.label) return String(body.sourceLabel.label);
  if (body.synthetic === true) return "synthetic";
  if (body.unavailable === true) return "unavailable";
  return "production_or_unlabeled";
}

async function probe(path) {
  const headers = { Accept: "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const okAuth = TOKEN
    ? res.status >= 200 && res.status < 300
    : res.status === 401 || res.status === 403;
  return {
    route: path,
    httpStatus: res.status,
    pass: okAuth,
    sourceClassification: classifySource(body),
    code:
      body && typeof body === "object" && typeof body.code === "string"
        ? body.code
        : null,
  };
}

async function main() {
  const mode = TOKEN ? "authenticated" : "unauthenticated_fail_closed";
  const results = [];
  for (const route of ROUTES) {
    results.push(await probe(route));
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode,
    tokenPresent: Boolean(TOKEN),
    // Never include token or Authorization headers.
    results,
    summary: {
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
      total: results.length,
    },
  };

  const outDir = join(process.cwd(), ".local");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "final-live-validation.json");
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log(
    `Wrote sanitized results to ${outPath} (${artifact.summary.pass}/${artifact.summary.total} PASS). Token never printed.`,
  );
  if (artifact.summary.fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

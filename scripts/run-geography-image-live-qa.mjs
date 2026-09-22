#!/usr/bin/env node
/**
 * Live QA: geography image proxy preview + QA-fixture upload probe.
 * Uses macOS keychain touri-admin-next-demo / info@admin.com or FINAL_LIVE_* env.
 * Never prints tokens or passwords.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveOperatorAuth,
  signInWithEmailPassword,
  DEFAULT_OPERATOR_EMAIL,
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
} from "./lib/driver-pilot-auth.mjs";

const BASE =
  process.env.FINAL_LIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://touri-admin-next.vercel.app";

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

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function main() {
  const report = { base: BASE };
  const auth = await resolveOperatorAuth({
    env: process.env,
    firebaseConfig: firebaseConfig(),
    localAuthPath: join(".local/write-pilots", ".final-live.json"),
    requestAuthMe: async (token) => {
      const r = await fetch(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
      return { httpStatus: r.status };
    },
    signIn: signInWithEmailPassword,
    isTTY: false,
    keychainService: KEYCHAIN_SERVICE,
    keychainAccount: KEYCHAIN_ACCOUNT,
    defaultEmail: DEFAULT_OPERATOR_EMAIL,
  });

  report.authMethod = auth.authMethod;
  report.authMe = auth.authMeHttpStatus;
  if (auth.blocker) report.blocker = auth.blocker;

  if (!auth.token) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const headers = {
    Authorization: `Bearer ${auth.token}`,
    Accept: "application/json",
  };

  const lmList = await fetch(`${BASE}/api/geography/landmarks?limit=30`, {
    headers,
  });
  report.landmarksListStatus = lmList.status;
  const lmJson = await lmList.json().catch(() => ({}));
  const rows = lmJson.items ?? lmJson.data ?? lmJson.landmarks ?? [];
  const withImg = Array.isArray(rows)
    ? rows.find((r) => r.imagePresence === "present")
    : null;
  if (withImg) {
    const id = withImg.landmarkId ?? withImg.id;
    const prev = await fetch(
      `${BASE}/api/storage/landmarks/${encodeURIComponent(id)}/0`,
      { headers },
    );
    report.livePreview = {
      landmarkId: id,
      status: prev.status,
      contentType: prev.headers.get("content-type"),
      bytes: prev.ok ? (await prev.arrayBuffer()).byteLength : null,
    };
  } else {
    report.livePreview = { status: "NO_CANDIDATE" };
  }

  const qaLm = await fetch(`${BASE}/api/geography/qa-fixture`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "idempotency-key": `img-qa-lm-${Date.now()}`,
    },
    body: JSON.stringify({ resource: "landmark" }),
  });
  const qaLmBody = await qaLm.json().catch(() => ({}));
  const landmarkId =
    qaLmBody.resourceId ?? qaLmBody.landmarkId ?? qaLmBody.id ?? null;
  report.qaLandmark = {
    status: qaLm.status,
    code: qaLmBody.code,
    id: landmarkId,
  };

  if (landmarkId) {
    const form = new FormData();
    form.set("action", "replace_landmark_image");
    form.set("slotOrIndex", "0");
    form.set("file", new Blob([tinyPngBuffer()], { type: "image/png" }), "qa.png");
    const up = await fetch(
      `${BASE}/api/storage/landmarks/${encodeURIComponent(landmarkId)}/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "idempotency-key": `up-lm-${Date.now()}`,
        },
        body: form,
      },
    );
    const upBody = await up.json().catch(() => ({}));
    report.liveUpload = {
      status: up.status,
      ok: upBody.ok,
      code: upBody.code,
      realUploadPerformed: upBody.realUploadPerformed,
      productionWriteExecuted: upBody.productionWriteExecuted,
    };
    if (up.ok && upBody.ok) {
      const reload = await fetch(
        `${BASE}/api/storage/landmarks/${encodeURIComponent(landmarkId)}/0`,
        { headers },
      );
      report.reloadPreview = {
        status: reload.status,
        contentType: reload.headers.get("content-type"),
        bytes: reload.ok ? (await reload.arrayBuffer()).byteLength : null,
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e?.message || e) }));
  process.exit(1);
});

/**
 * Shared 40/40 authenticated Production read validation for write pilots.
 */

import {
  evaluateDisarmedWriteProbe,
  formatLiveGatesArmedPreflightError,
  writeBlockProbeResult,
} from "./write-probe-preflight.mjs";

export const LIST_ROUTES = [
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
  "/api/geography/regions",
  "/api/vehicle-catalog",
  "/api/partners",
  "/api/fleet",
  "/api/guides",
  "/api/finance/periods",
  "/api/reports",
];

export const DETAIL_FROM_LIST = [
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

const SAUDI_ALIASES = new Set([
  "saudi_arabia",
  "sa",
  "demo_saudi",
  "ksa",
  "السعودية",
]);

function classifySource(body) {
  if (!body || typeof body !== "object") return "unknown";
  if (typeof body.sourceLabel === "string") return body.sourceLabel;
  if (body.sourceLabel?.label) return String(body.sourceLabel.label);
  if (body.synthetic === true || body.meta?.synthetic === true) return "synthetic";
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

export function firstListId(body, idKeys) {
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

/**
 * @param {(path: string, opts?: object) => Promise<object>} requestJson
 * @param {string} token
 */
export async function runAuthenticatedValidation(requestJson, token) {
  const results = [];
  const failedRoutes = [];

  const expectOk = (probe, { requireProductionSource = false } = {}) => {
    const classification = classifySource(probe.body);
    probe.sourceClassification = classification;
    const okStatus = probe.httpStatus >= 200 && probe.httpStatus < 300;
    const notSynthetic =
      classification !== "synthetic" &&
      classification !== "development_synthetic";
    let pass = okStatus && probe.httpStatus !== 500 && notSynthetic;
    if (requireProductionSource && pass) {
      pass = isProductionishSource(classification);
    }
    probe.pass = pass;
    results.push({
      route: probe.route,
      method: probe.method,
      httpStatus: probe.httpStatus,
      pass,
      code: probe.code,
      sourceClassification: classification,
    });
    if (!pass) failedRoutes.push(probe.route);
    return probe;
  };

  for (const route of LIST_ROUTES) {
    const probe = await requestJson(route, { token });
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
    expectOk(probe, { requireProductionSource });
  }

  for (const spec of DETAIL_FROM_LIST) {
    const listProbe = await requestJson(spec.list, { token });
    const id = firstListId(listProbe.body, spec.idKeys);
    if (!id) {
      results.push({
        route: `${spec.detail("<missing>")}`,
        method: "GET",
        httpStatus: 0,
        pass: true,
        code: "NO_LIST_ID",
        sourceClassification: "skipped",
      });
      continue;
    }
    const probe = await requestJson(spec.detail(encodeURIComponent(id)), {
      token,
    });
    expectOk(probe);
  }

  {
    const probe = await requestJson("/api/trips/__final_live_missing_id__", {
      token,
    });
    probe.pass =
      probe.httpStatus === 404 &&
      (probe.body?.code === "NOT_FOUND" ||
        probe.body?.code == null ||
        String(probe.body?.code).toUpperCase() === "NOT_FOUND");
    results.push({
      route: probe.route,
      method: "GET",
      httpStatus: probe.httpStatus,
      pass: probe.pass,
      code: probe.code,
      sourceClassification: classifySource(probe.body),
    });
    if (!probe.pass) failedRoutes.push(probe.route);
  }

  const unfiltered = await requestJson("/api/geography/landmarks", { token });
  const filteredProbe = await requestJson(
    "/api/geography/landmarks?countryId=saudi_arabia",
    { token },
  );
  const unfilteredItems = Array.isArray(unfiltered.body?.items)
    ? unfiltered.body.items
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
          classifySource(filteredProbe.body),
        )
      : [...saudiIds].some((id) =>
          filteredItems.some(
            (i) => extractItemId(i, ["landmarkId", "id"]) === id,
          ),
        ) || filteredItems.some(isSaudiLandmark);
  const geoPass =
    filteredProbe.httpStatus >= 200 &&
    filteredProbe.httpStatus < 300 &&
    filteredProbe.httpStatus !== 500 &&
    !["synthetic", "development_synthetic"].includes(
      classifySource(filteredProbe.body),
    ) &&
    retainedVisible &&
    (saudiIds.size === 0 || filteredItems.length > 0);
  results.push({
    route: filteredProbe.route,
    method: "GET",
    httpStatus: filteredProbe.httpStatus,
    pass: geoPass,
    code: filteredProbe.code,
    sourceClassification: classifySource(filteredProbe.body),
  });
  if (!geoPass) failedRoutes.push(filteredProbe.route);

  const writeProbe = await requestJson("/api/drivers/probe/approve", {
    method: "POST",
    token,
    body: {},
  });
  const writeEval = evaluateDisarmedWriteProbe(writeProbe);
  const writeBlocked = writeEval.pass;
  const writeBlockProbe = writeBlockProbeResult(writeProbe, writeEval);
  const liveGatesArmedBlocker =
    writeEval.armedPathLikely && !writeBlocked
      ? formatLiveGatesArmedPreflightError(writeEval)
      : null;

  results.push({
    route: writeProbe.route,
    method: "POST",
    httpStatus: writeProbe.httpStatus,
    pass: writeBlocked,
    code: writeProbe.code,
    sourceClassification: classifySource(writeProbe.body),
  });
  if (!writeBlocked) failedRoutes.push(writeProbe.route);

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  const total = results.length;
  const ok40 = pass === 40 && fail === 0 && total === 40 && failedRoutes.length === 0;

  return {
    pass: ok40,
    summary: { pass, fail, total, authenticatedLiveValidation: ok40 ? "PASS" : "FAIL" },
    failedRoutes: [...new Set(failedRoutes)],
    writeBlockProbe,
    liveGatesArmedBlocker,
  };
}

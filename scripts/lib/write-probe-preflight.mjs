/**
 * Write-zero / disarmed preflight helpers for production pilot scripts.
 * Pure functions — safe for unit tests (no network).
 */

export function probeErrorCode(probe) {
  if (!probe || typeof probe !== "object") return null;
  if (typeof probe.code === "string" && probe.code.trim()) {
    return probe.code.trim();
  }
  const body = probe.body;
  if (body && typeof body === "object") {
    if (typeof body.code === "string" && body.code.trim()) return body.code.trim();
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  }
  return null;
}

export function isProductionWriteDisabled403(probe) {
  const code = probeErrorCode(probe);
  return probe.httpStatus === 403 && code === "PRODUCTION_WRITE_DISABLED";
}

export function isCanonicalWriteBlocked403(probe) {
  const blockedCodes = new Set([
    "PRODUCTION_WRITE_DISABLED",
    "RESOURCE_WRITE_DISABLED",
  ]);
  const code = probeErrorCode(probe);
  return (
    probe.httpStatus === 403 &&
    blockedCodes.has(String(code || ""))
  );
}

/**
 * When Production write gates are disarmed, authenticated write-zero probe
 * should return 403 PRODUCTION_WRITE_DISABLED. Any other stable response
 * (401, 2xx, other 403) suggests the live trap is open (gates armed).
 */
export function evaluateDisarmedWriteProbe(probe) {
  const httpStatus =
    typeof probe?.httpStatus === "number" ? probe.httpStatus : 0;
  const code = probeErrorCode(probe);
  const pass = isProductionWriteDisabled403(probe);
  const network = httpStatus === 0 || code === "NETWORK_ERROR";
  let armedPathLikely = false;
  if (!pass && !network) {
    if (httpStatus === 401) {
      armedPathLikely = true;
    } else if (httpStatus >= 200 && httpStatus < 300) {
      armedPathLikely = true;
    } else if (
      httpStatus === 403 &&
      code !== "PRODUCTION_WRITE_DISABLED" &&
      code !== "RESOURCE_WRITE_DISABLED"
    ) {
      armedPathLikely = true;
    } else if (httpStatus >= 500) {
      armedPathLikely = false;
    } else if (httpStatus === 404 || httpStatus === 405) {
      armedPathLikely = false;
    }
  }
  return {
    httpStatus,
    code: code ? String(code) : null,
    pass,
    armedPathLikely,
    network,
  };
}

export function formatLiveGatesArmedPreflightError(evalResult) {
  return (
    `LIVE_GATES_APPEAR_ARMED: write-zero preflight expected HTTP 403 ` +
    `PRODUCTION_WRITE_DISABLED while gates are disarmed; got HTTP ${evalResult.httpStatus} ` +
    `code=${evalResult.code ?? "null"}. Disarm GLOBAL/PRODUCTION/domain write gates and redeploy ` +
    `before AUTH_PREFLIGHT_ONLY or write-zero validation.`
  );
}

export function writeBlockProbeResult(probe, evalResult) {
  return {
    route: probe?.route ?? "/api/drivers/probe/approve",
    httpStatus: evalResult.httpStatus,
    code: evalResult.code,
    pass: evalResult.pass,
    armedPathLikely: evalResult.armedPathLikely,
  };
}

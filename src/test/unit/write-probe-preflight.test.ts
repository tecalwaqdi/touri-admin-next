import { describe, expect, it } from "vitest";
import {
  evaluateDisarmedWriteProbe,
  formatLiveGatesArmedPreflightError,
  isProductionWriteDisabled403,
  writeBlockProbeResult,
} from "../../../scripts/lib/write-probe-preflight.mjs";

describe("write-probe-preflight", () => {
  it("passes when HTTP 403 PRODUCTION_WRITE_DISABLED", () => {
    const probe = {
      route: "/api/drivers/probe/approve",
      httpStatus: 403,
      code: "PRODUCTION_WRITE_DISABLED",
      body: { error: "PRODUCTION_WRITE_DISABLED" },
    };
    const evalResult = evaluateDisarmedWriteProbe(probe);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.armedPathLikely).toBe(false);
    expect(isProductionWriteDisabled403(probe)).toBe(true);
  });

  it("flags armed path on HTTP 401 during disarmed preflight", () => {
    const probe = {
      httpStatus: 401,
      code: "UNAUTHORIZED",
      body: { code: "UNAUTHORIZED" },
    };
    const evalResult = evaluateDisarmedWriteProbe(probe);
    expect(evalResult.pass).toBe(false);
    expect(evalResult.armedPathLikely).toBe(true);
    expect(formatLiveGatesArmedPreflightError(evalResult)).toMatch(
      /LIVE_GATES_APPEAR_ARMED/,
    );
  });

  it("persists httpStatus and code in writeBlockProbeResult", () => {
    const probe = {
      route: "/api/drivers/probe/approve",
      httpStatus: 401,
      code: "UNAUTHORIZED",
    };
    const evalResult = evaluateDisarmedWriteProbe(probe);
    const row = writeBlockProbeResult(probe, evalResult);
    expect(row.httpStatus).toBe(401);
    expect(row.code).toBe("UNAUTHORIZED");
    expect(row.pass).toBe(false);
    expect(row.armedPathLikely).toBe(true);
  });

  it("write-zero check #40 requires PRODUCTION_WRITE_DISABLED not RESOURCE only", () => {
    const probe = {
      httpStatus: 403,
      code: "RESOURCE_WRITE_DISABLED",
    };
    const evalResult = evaluateDisarmedWriteProbe(probe);
    expect(evalResult.pass).toBe(false);
    expect(evalResult.armedPathLikely).toBe(false);
  });
});

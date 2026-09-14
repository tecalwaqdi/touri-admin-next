/**
 * Phase 4A-0 — shadow mode write / export / settlement traps.
 */

import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";

export class ShadowExportDisabledError extends Error {
  readonly code = "SHADOW_EXPORT_DISABLED";
  constructor(message = "Export is disabled in production shadow mode") {
    super(message);
    this.name = "ShadowExportDisabledError";
  }
}

export class ShadowSettlementDisabledError extends Error {
  readonly code = "SHADOW_SETTLEMENT_DISABLED";
  constructor(message = "Settlement operations are disabled in shadow mode") {
    super(message);
    this.name = "ShadowSettlementDisabledError";
  }
}

export function assertShadowMutationAllowed(method: string): never {
  throw new ProductionWriteDisabledError(
    `PRODUCTION_WRITE_DISABLED: ${method} denied in shadow`,
  );
}

export function assertShadowExportAllowed(): never {
  throw new ShadowExportDisabledError();
}

export function assertShadowSettlementAllowed(): never {
  throw new ShadowSettlementDisabledError();
}

/**
 * Classify an API method for shadow traps.
 */
export function shadowTrapForRequest(input: {
  method: string;
  path: string;
  productionReadMode: "disabled" | "shadow";
  /** When true, synthetic development path may still mutate in-memory data. */
  allowSyntheticMutations: boolean;
}):
  | { action: "allow" }
  | {
      action: "deny";
      code:
        | "PRODUCTION_WRITE_DISABLED"
        | "SHADOW_EXPORT_DISABLED"
        | "SHADOW_SETTLEMENT_DISABLED";
      status: number;
    } {
  const method = input.method.toUpperCase();
  const path = input.path;

  // Production shadow: all mutations denied
  if (input.productionReadMode === "shadow") {
    if (path.includes("/api/reports/export")) {
      return { action: "deny", code: "SHADOW_EXPORT_DISABLED", status: 403 };
    }
    if (path.includes("/api/settlements")) {
      if (method !== "GET" || path.match(/\/(submit|approve|reject|close|reverse)/)) {
        return {
          action: "deny",
          code: "SHADOW_SETTLEMENT_DISABLED",
          status: 403,
        };
      }
      // Settlement list/detail also hidden / disabled for production path
      return {
        action: "deny",
        code: "SHADOW_SETTLEMENT_DISABLED",
        status: 403,
      };
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return {
        action: "deny",
        code: "PRODUCTION_WRITE_DISABLED",
        status: 403,
      };
    }
  }

  // Even when mode=disabled, if someone hits production write path — deny
  if (
    !input.allowSyntheticMutations &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method)
  ) {
    return {
      action: "deny",
      code: "PRODUCTION_WRITE_DISABLED",
      status: 403,
    };
  }

  return { action: "allow" };
}

/**
 * Phase 4 DESIGN / 4A-1 — observability events (no sensitive payloads).
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "@/infrastructure/logging/logger";

export type ProductionReadObservabilityEvent =
  | {
      type: "production_read_request";
      resource: string;
      actorUidHash?: string;
      durationMs?: number;
    }
  | {
      type: "production_read_denied";
      reason: string;
      code: string;
    }
  | {
      type: "scope_denied";
      reason: string;
    }
  | {
      type: "pii_redacted";
      resource: string;
      fieldCount: number;
    }
  | {
      type: "sensitive_field_read";
      resource: string;
      field: string;
      /** Never log raw values */
      actorUidHash?: string;
    }
  | {
      type: "mapping_warning";
      resource: string;
      warningCode: string;
    }
  | {
      type: "mapping_failure";
      resource: string;
      warningCode: string;
    }
  | {
      type: "shadow_comparison_mismatch";
      category: string;
      field: string;
    }
  | {
      type: "kill_switch_triggered";
      flag: string;
    }
  | {
      type: "circuit_breaker_open";
      resource: string;
    };

export interface ProductionReadObservability {
  emit(event: ProductionReadObservabilityEvent): void;
  list(): ProductionReadObservabilityEvent[];
}

function scrubEvent(
  event: ProductionReadObservabilityEvent,
): ProductionReadObservabilityEvent {
  const safe = { ...event } as Record<string, unknown>;
  delete safe.token;
  delete safe.phone;
  delete safe.email;
  delete safe.raw;
  delete safe.claims;
  delete safe.private_key;
  return safe as unknown as ProductionReadObservabilityEvent;
}

export class InMemoryProductionReadObservability
  implements ProductionReadObservability
{
  private readonly events: ProductionReadObservabilityEvent[] = [];

  emit(event: ProductionReadObservabilityEvent): void {
    this.events.push(scrubEvent(event));
  }

  list(): ProductionReadObservabilityEvent[] {
    return [...this.events];
  }
}

/**
 * Structured logger sink — safe for live attempt (no secrets; uses shared scrubber).
 */
export class StructuredLoggerProductionReadObservability
  implements ProductionReadObservability
{
  private readonly memory = new InMemoryProductionReadObservability();

  emit(event: ProductionReadObservabilityEvent): void {
    const safe = scrubEvent(event);
    this.memory.emit(safe);
    logger.info("production_read_observability", {
      eventType: safe.type,
      ...safe,
    });
  }

  list(): ProductionReadObservabilityEvent[] {
    return this.memory.list();
  }
}

/**
 * Local NDJSON file sink — path must be outside git (e.g. `.local/observability/`).
 * Never writes tokens / private keys / raw documents.
 */
export class FileNdjsonProductionReadObservability
  implements ProductionReadObservability
{
  private readonly memory = new InMemoryProductionReadObservability();

  constructor(private readonly filePath: string) {}

  emit(event: ProductionReadObservabilityEvent): void {
    const safe = scrubEvent(event);
    this.memory.emit(safe);
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(
      this.filePath,
      `${JSON.stringify({ at: new Date().toISOString(), ...safe })}\n`,
      { encoding: "utf8" },
    );
  }

  list(): ProductionReadObservabilityEvent[] {
    return this.memory.list();
  }
}

export type ObservabilitySinkKind = "memory" | "structured_logger" | "file_ndjson";

export function createProductionReadObservability(input: {
  sink: ObservabilitySinkKind;
  filePath?: string;
}): ProductionReadObservability {
  if (input.sink === "structured_logger") {
    return new StructuredLoggerProductionReadObservability();
  }
  if (input.sink === "file_ndjson") {
    if (!input.filePath?.trim()) {
      throw new Error(
        "PRODUCTION_READ_OBSERVABILITY_FILE required for file_ndjson sink",
      );
    }
    return new FileNdjsonProductionReadObservability(input.filePath);
  }
  return new InMemoryProductionReadObservability();
}

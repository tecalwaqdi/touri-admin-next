/**
 * Generic P0 master-data controlled write executor (Fake offline + Production denied).
 * Prefer activate/deactivate/archive — no hard delete.
 */

import {
  assertP0ProductionWriteEnabled,
  type P0WriteDomain,
  type P0WriteFlagGate,
} from "@/application/controlled-writes/P0WriteGates";
import type { AccessScope, Permission, Role } from "@/types/roles";

export type P0MasterWriteAction =
  | "create"
  | "update_metadata"
  | "activate"
  | "deactivate"
  | "archive";

export type P0MasterWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type P0MasterWriteCommand = {
  actor: P0MasterWriteActor;
  domain: P0WriteDomain;
  resourceId: string;
  action: P0MasterWriteAction;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
  metadata?: Record<string, string | number | boolean | null>;
  reasonCode: string;
  note?: string;
};

export type P0MasterWriteSnapshot = {
  domain: P0WriteDomain;
  resourceId: string;
  exists: boolean;
  active: boolean;
  archived: boolean;
  preconditionToken: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type P0MasterWriteResponse = {
  ok: boolean;
  status: "applied" | "denied" | "failed" | "idempotent_replay";
  code: string;
  message: string;
  action: P0MasterWriteAction;
  domain: P0WriteDomain;
  resourceId: string;
  productionWriteExecuted: boolean;
  auditIntentId?: string;
};

export class FakeP0MasterWriteRepository {
  readonly kind = "fake_p0_master_write" as const;
  readonly applied: P0MasterWriteCommand[] = [];
  private readonly store = new Map<string, P0MasterWriteSnapshot>();

  private key(domain: P0WriteDomain, id: string): string {
    return `${domain}:${id}`;
  }

  seed(snapshot: P0MasterWriteSnapshot): void {
    this.store.set(this.key(snapshot.domain, snapshot.resourceId), {
      ...snapshot,
      metadata: { ...snapshot.metadata },
    });
  }

  get(domain: P0WriteDomain, id: string): P0MasterWriteSnapshot | undefined {
    const s = this.store.get(this.key(domain, id));
    return s ? { ...s, metadata: { ...s.metadata } } : undefined;
  }

  async apply(command: P0MasterWriteCommand): Promise<{
    productionWriteExecuted: false;
    preconditionToken: string;
  }> {
    if (command.action === "create") {
      const next: P0MasterWriteSnapshot = {
        domain: command.domain,
        resourceId: command.resourceId,
        exists: true,
        active: true,
        archived: false,
        preconditionToken: `p0_${Date.now().toString(36)}`,
        metadata: { ...(command.metadata ?? {}) },
      };
      this.store.set(this.key(next.domain, next.resourceId), next);
      this.applied.push(command);
      return {
        productionWriteExecuted: false,
        preconditionToken: next.preconditionToken,
      };
    }

    const current = this.store.get(
      this.key(command.domain, command.resourceId),
    );
    if (!current?.exists) {
      throw Object.assign(new Error("RESOURCE_NOT_FOUND"), {
        code: "RESOURCE_NOT_FOUND",
      });
    }
    if (current.preconditionToken !== command.preconditionToken) {
      throw Object.assign(new Error("PRECONDITION_FAILED"), {
        code: "PRECONDITION_FAILED",
      });
    }

    const next = {
      ...current,
      metadata: { ...current.metadata, ...(command.metadata ?? {}) },
    };
    if (command.action === "activate") next.active = true;
    if (command.action === "deactivate") next.active = false;
    if (command.action === "archive") {
      next.archived = true;
      next.active = false;
    }
    next.preconditionToken = `p0_${Date.now().toString(36)}`;
    this.store.set(this.key(next.domain, next.resourceId), next);
    this.applied.push(command);
    return {
      productionWriteExecuted: false,
      preconditionToken: next.preconditionToken,
    };
  }
}

export class DisabledP0MasterWriteRepository {
  readonly kind = "disabled_p0_master_write" as const;
  constructor(
    private readonly domain: P0WriteDomain,
    private readonly flags: P0WriteFlagGate,
  ) {}
  async apply(_command: P0MasterWriteCommand): Promise<never> {
    assertP0ProductionWriteEnabled(this.domain, this.flags);
    throw new Error("unreachable");
  }
}

export async function executeP0MasterControlledWrite(
  command: P0MasterWriteCommand,
  deps: {
    flags: P0WriteFlagGate;
    repository: {
      apply: (
        c: P0MasterWriteCommand,
      ) => Promise<{ productionWriteExecuted: boolean; preconditionToken: string }>;
    };
    allowOfflineExecution: boolean;
  },
): Promise<P0MasterWriteResponse> {
  if (!deps.allowOfflineExecution) {
    try {
      assertP0ProductionWriteEnabled(command.domain, deps.flags);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return {
        ok: false,
        status: "denied",
        code: err.code ?? "PRODUCTION_WRITE_DISABLED",
        message: err.message ?? "Write disabled",
        action: command.action,
        domain: command.domain,
        resourceId: command.resourceId,
        productionWriteExecuted: false,
      };
    }
  }

  try {
    const result = await deps.repository.apply(command);
    return {
      ok: true,
      status: "applied",
      code: "APPLIED",
      message: "applied",
      action: command.action,
      domain: command.domain,
      resourceId: command.resourceId,
      productionWriteExecuted: result.productionWriteExecuted === true,
      auditIntentId: `audit_${command.idempotencyKey}`,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      ok: false,
      status: "failed",
      code: err.code ?? "FAILED",
      message: err.message ?? "failed",
      action: command.action,
      domain: command.domain,
      resourceId: command.resourceId,
      productionWriteExecuted: false,
    };
  }
}

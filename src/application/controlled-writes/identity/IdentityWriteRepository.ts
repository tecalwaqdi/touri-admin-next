/**
 * Identity write repository — Fake (offline) + REAL Production (dedicated WIF).
 * Production path MUST use identity-admin WIF SA (never shadow-reader).
 * Auth claims: CF syncUserClaimsOnWrite — never setCustomUserClaims here.
 */

import type {
  IdentityWriteApplyInput,
  IdentityWriteApplyResult,
  IdentityWriteFlagGate,
  IdentityWriteSnapshot,
  IdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";
import { IdentityWriteError } from "@/application/controlled-writes/identity/IdentityWriteErrors";
import { assertIdentityProductionWriteEnabled } from "@/application/controlled-writes/identity/IdentityWriteFlags";
import { resolveWritePrincipal } from "@/infrastructure/production/writes/ProductionWritePrincipals";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export type IdentityWriteRepository = {
  readonly kind:
    | "fake_identity_write"
    | "disabled_identity_write"
    | "production_identity_write"
    | "production_identity_write_unreachable";
  apply(input: IdentityWriteApplyInput): Promise<IdentityWriteApplyResult>;
};

function nextToken(prev: string): string {
  return `idtok_${prev}_${Date.now().toString(36)}`;
}

export class FakeIdentityWriteRepository implements IdentityWriteRepository {
  readonly kind = "fake_identity_write" as const;
  readonly applied: IdentityWriteApplyResult[] = [];
  private readonly users = new Map<string, IdentityWriteSnapshot>();

  seed(snapshot: IdentityWriteSnapshot): void {
    this.users.set(snapshot.userId, { ...snapshot });
  }

  get(userId: string): IdentityWriteSnapshot | undefined {
    const s = this.users.get(userId);
    return s ? { ...s } : undefined;
  }

  async apply(input: IdentityWriteApplyInput): Promise<IdentityWriteApplyResult> {
    const existing = this.users.get(input.command.targetUserId);
    if (
      !existing &&
      input.command.action !== "create_persona"
    ) {
      throw new IdentityWriteError(
        "USER_NOT_FOUND",
        `Fake identity store missing ${input.command.targetUserId}`,
      );
    }
    const current: IdentityWriteSnapshot =
      existing ??
      ({
        userId: input.command.targetUserId,
        exists: false,
        isPanelPersona: false,
        role: "none",
        disabled: false,
        countryId: null,
        agentId: null,
        superAdminCountHint: null,
        preconditionToken: "",
        reconciliation: "PERSONA_MISSING",
      } satisfies IdentityWriteSnapshot);
    if (
      current.exists &&
      input.command.preconditionToken !== "unknown" &&
      current.preconditionToken !== input.command.preconditionToken
    ) {
      throw new IdentityWriteError(
        "PRECONDITION_FAILED",
        "Concurrency token mismatch",
      );
    }

    let toRole: IdentityWritableRole | "none" | "unsupported" = current.role;
    let toDisabled = current.disabled;
    let countryId = current.countryId;
    let agentId = current.agentId;

    switch (input.command.action) {
      case "create_persona":
        toRole = input.command.role;
        toDisabled = false;
        countryId = input.command.countryId ?? null;
        agentId = input.command.agentId ?? null;
        break;
      case "activate":
        toDisabled = false;
        break;
      case "deactivate":
        toDisabled = true;
        break;
      case "assign_role":
      case "change_role":
        toRole = input.command.role;
        if (input.command.countryId) countryId = input.command.countryId;
        break;
      case "assign_country_scope":
        countryId = input.command.countryId;
        break;
      case "assign_agent_scope":
        agentId = input.command.agentId;
        countryId = input.command.countryId;
        break;
      case "clear_scope":
        countryId = null;
        agentId = null;
        break;
    }

    const token = nextToken(current.preconditionToken || "new");
    const next: IdentityWriteSnapshot = {
      userId: input.command.targetUserId,
      exists: true,
      isPanelPersona: true,
      role: toRole,
      disabled: toDisabled,
      countryId,
      agentId,
      superAdminCountHint: current.superAdminCountHint,
      preconditionToken: token,
      reconciliation: "UNKNOWN",
    };
    this.users.set(next.userId, next);

    const result: IdentityWriteApplyResult = {
      userId: next.userId,
      action: input.command.action,
      toRole,
      toDisabled,
      preconditionToken: token,
      productionWriteExecuted: false,
      claimsMutationPath: "syncUserClaimsOnWrite",
      patchKeys: input.allowlistedFields,
    };
    this.applied.push(result);
    return result;
  }
}

export class DisabledIdentityWriteRepository implements IdentityWriteRepository {
  readonly kind = "disabled_identity_write" as const;

  constructor(private readonly flags: IdentityWriteFlagGate) {}

  async apply(_input: IdentityWriteApplyInput): Promise<IdentityWriteApplyResult> {
    assertIdentityProductionWriteEnabled(this.flags);
    throw new IdentityWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "DisabledIdentityWriteRepository unreachable success path",
    );
  }
}

/** @deprecated prefer ProductionIdentityWriteRepository */
export class ProductionIdentityWriteRepositoryUnreachable
  implements IdentityWriteRepository
{
  readonly kind = "production_identity_write_unreachable" as const;
  constructor(private readonly flags: IdentityWriteFlagGate) {}
  async apply(input: IdentityWriteApplyInput): Promise<IdentityWriteApplyResult> {
    return new ProductionIdentityWriteRepository(this.flags).apply(input);
  }
}

/**
 * REAL Production identity writer — dedicated identity-admin WIF only.
 */
export class ProductionIdentityWriteRepository implements IdentityWriteRepository {
  readonly kind = "production_identity_write" as const;

  constructor(
    private readonly flags: IdentityWriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async apply(input: IdentityWriteApplyInput): Promise<IdentityWriteApplyResult> {
    assertIdentityProductionWriteEnabled(this.flags);
    const principal = resolveWritePrincipal("identity_admin");
    if (!principal.ready && !this.port) {
      throw new IdentityWriteError(
        "IDENTITY_ADMIN_WIF_REQUIRED",
        `Production identity writes require dedicated WIF SA (${principal.envVar}): ${principal.reason}`,
      );
    }
    const port =
      this.port ??
      createWifWritePortOrThrow("identity_admin");
    const cmd = input.command as IdentityWriteApplyInput["command"] & {
      role?: IdentityWritableRole;
      countryId?: string | null;
      agentId?: string | null;
    };
    // Apply policy-built allowlisted patch only (never arbitrary body keys).
    const allow = new Set(input.allowlistedFields);
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.patch ?? {})) {
      if (allow.has(key) && value !== undefined) cleaned[key] = value;
    }
    if (input.command.action === "create_persona") {
      cleaned.is_panel_persona = true;
      try {
        await port.createDocument("user", input.command.targetUserId, cleaned);
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code !== "ALREADY_EXISTS") throw err;
        // Resumable: incomplete prior create → merge allowlisted fields.
        await port.updateDocument("user", input.command.targetUserId, cleaned, {
          expectedUpdateTime: null,
          allowCreate: false,
        });
      }
    } else {
      const expectedUt =
        input.command.preconditionToken !== "unknown" &&
        input.command.preconditionToken.startsWith("fs_ut_")
          ? input.command.preconditionToken.slice("fs_ut_".length)
          : undefined;
      await port.updateDocument("user", input.command.targetUserId, cleaned, {
        expectedUpdateTime: expectedUt ?? null,
      });
    }
    return {
      userId: input.command.targetUserId,
      action: input.command.action,
      toRole: cmd.role ?? "none",
      toDisabled: input.command.action === "deactivate",
      preconditionToken: nextToken(input.command.preconditionToken || "prod"),
      productionWriteExecuted: true,
      claimsMutationPath: "syncUserClaimsOnWrite",
      patchKeys: Object.keys(cleaned),
    };
  }
}

import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getEnv } from "@/config/env";
import { createIdempotencyKey } from "@/lib/ids";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import {
  FakeP0MasterWriteRepository,
  executeP0MasterControlledWrite,
  type P0MasterWriteAction,
} from "@/application/controlled-writes/P0MasterControlledWriteService";
import { ProductionP0MasterWriteRepository } from "@/infrastructure/production/writes/ProductionDomainWriteRepositories";
import type { P0WriteDomain } from "@/application/controlled-writes/P0WriteGates";
import {
  FakeTransportCompanyAuthCreatePort,
  createIdentityToolkitSignUpAuthPort,
  provisionTransportCompanyLogin,
  validateTransportCompanyLoginFields,
} from "@/application/controlled-writes/fleet/TransportCompanyLoginProvision";
import {
  createWifWritePortOrThrow,
  FakeProductionFirestoreWritePort,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { resolveWritePrincipal } from "@/infrastructure/production/writes/ProductionWritePrincipals";

const ACTIONS: P0MasterWriteAction[] = [
  "create",
  "update_metadata",
  "activate",
  "deactivate",
  "archive",
];
const offline = new FakeP0MasterWriteRepository();
const offlineAuth = new FakeTransportCompanyAuthCreatePort();
const offlineFs = new FakeProductionFirestoreWritePort();

function flagsFromEnv(env: ReturnType<typeof getEnv>) {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
    VEHICLE_CATALOG_WRITE_ENABLED: env.VEHICLE_CATALOG_WRITE_ENABLED,
    PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
    FLEET_WRITE_ENABLED: env.FLEET_WRITE_ENABLED,
    GUIDE_WRITE_ENABLED: env.GUIDE_WRITE_ENABLED,
    GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
  };
}

async function handleP0Write(
  request: Request,
  domain: P0WriteDomain,
  id: string,
  action: string,
) {
  if (!ACTIONS.includes(action as P0MasterWriteAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");
    const env = getEnv();
    const flags = flagsFromEnv(env);
    const body = (await request.json().catch(() => ({}))) as {
      preconditionToken?: string;
      metadata?: Record<string, string | number | boolean | null>;
      reasonCode?: string;
      note?: string;
      /** Panel login password for transport_manager (never stored in company doc). */
      loginPassword?: string;
    };
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();
    const repository = allowOffline
      ? offline
      : new ProductionP0MasterWriteRepository(domain, flags);

    // Fleet create: require login email+password so the company can enter Admin Next.
    let loginMeta: {
      email: string;
      password: string;
      displayName: string;
    } | null = null;
    if (domain === "fleet" && action === "create") {
      const loginCheck = validateTransportCompanyLoginFields({
        email:
          typeof body.metadata?.email === "string" ? body.metadata.email : null,
        password: body.loginPassword ?? null,
        displayName:
          typeof body.metadata?.displayName === "string"
            ? body.metadata.displayName
            : typeof body.metadata?.naim === "string"
              ? body.metadata.naim
              : null,
      });
      if (!loginCheck.ok) {
        return Response.json(
          { ok: false, code: loginCheck.code, message: loginCheck.message },
          { status: 400 },
        );
      }
      if (
        !body.metadata?.licenseNumber &&
        !body.metadata?.license_number
      ) {
        return Response.json(
          {
            ok: false,
            code: "VALIDATION_FAILED",
            message: "licenseNumber required",
          },
          { status: 400 },
        );
      }
      if (!body.metadata?.countryId) {
        return Response.json(
          {
            ok: false,
            code: "VALIDATION_FAILED",
            message: "countryId required",
          },
          { status: 400 },
        );
      }
      loginMeta = {
        email: loginCheck.email,
        password: loginCheck.password,
        displayName: loginCheck.displayName,
      };
      // Ensure email lands on company metadata (password never does).
      body.metadata = {
        ...(body.metadata ?? {}),
        email: loginCheck.email,
        displayName: loginCheck.displayName,
      };
    }

    const result = await executeP0MasterControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        domain,
        resourceId: id,
        action: action as P0MasterWriteAction,
        preconditionToken: body.preconditionToken ?? "unknown",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() || createIdempotencyKey(),
        correlationId: ctx.correlationId,
        metadata: body.metadata,
        reasonCode: body.reasonCode ?? "operational",
        note: body.note,
      },
      { flags, repository, allowOfflineExecution: allowOffline },
    );

    let loginProvision: Awaited<
      ReturnType<typeof provisionTransportCompanyLogin>
    > | null = null;
    if (
      domain === "fleet" &&
      action === "create" &&
      result.ok &&
      loginMeta
    ) {
      let writePort = null as
        | ReturnType<typeof createWifWritePortOrThrow>
        | FakeProductionFirestoreWritePort
        | null;
      if (allowOffline) {
        writePort = offlineFs;
      } else if (env.FLEET_WRITE_ENABLED) {
        const principal = resolveWritePrincipal("ops_writer");
        if (principal.ready) {
          try {
            writePort = createWifWritePortOrThrow("ops_writer");
          } catch {
            writePort = null;
          }
        }
      }

      const apiKey =
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
        process.env.FIREBASE_WEB_API_KEY?.trim() ||
        "";
      const auth = allowOffline
        ? offlineAuth
        : apiKey
          ? createIdentityToolkitSignUpAuthPort({ apiKey })
          : offlineAuth;

      loginProvision = await provisionTransportCompanyLogin(
        {
          transportCompanyId: id,
          displayName: loginMeta.displayName,
          email: loginMeta.email,
          password: loginMeta.password,
          phone:
            typeof body.metadata?.phone === "string"
              ? body.metadata.phone
              : null,
          countryId:
            typeof body.metadata?.countryId === "string"
              ? body.metadata.countryId
              : null,
          correlationId: ctx.correlationId,
        },
        {
          auth,
          writePort,
          allowOffline,
        },
      );
    }

    return jsonWithIds(
      {
        ...result,
        ...(loginProvision
          ? {
              login: {
                ok: loginProvision.ok,
                ...(loginProvision.ok
                  ? {
                      uid: loginProvision.uid,
                      email: loginProvision.email,
                      authProvisioned: loginProvision.authProvisioned,
                      userDocWritten: loginProvision.userDocWritten,
                      companyOwnerLinked: loginProvision.companyOwnerLinked,
                    }
                  : {
                      code: loginProvision.code,
                      message: loginProvision.message,
                    }),
              },
            }
          : {}),
      },
      ctx,
      {
        status: result.ok
          ? 200
          : result.code === "PRODUCTION_WRITE_DISABLED"
            ? 403
            : 409,
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}

/** POST /api/fleet/[id]/[action] */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  const { id, action } = await context.params;
  return handleP0Write(request, "fleet", id, action);
}

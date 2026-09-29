/**
 * Provision transport company panel login (email + password).
 * Creates Firebase Auth user + Legacy user/{uid} with isAdminRule=4 so
 * syncUserClaimsOnWrite can emit transport_manager + transport_company_id.
 *
 * Password is never persisted in Firestore / audit payloads.
 */

import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export type TransportCompanyLoginInput = {
  transportCompanyId: string;
  displayName: string;
  email: string;
  password: string;
  phone?: string | null;
  countryId?: string | null;
  correlationId: string;
};

export type TransportCompanyLoginResult =
  | {
      ok: true;
      uid: string;
      email: string;
      authProvisioned: boolean;
      userDocWritten: boolean;
      companyOwnerLinked: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type TransportCompanyAuthCreatePort = {
  createEmailPasswordUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ uid: string }>;
};

/** Offline/Fake Auth create — deterministic uid, no network. */
export class FakeTransportCompanyAuthCreatePort
  implements TransportCompanyAuthCreatePort
{
  readonly created: Array<{ email: string; displayName: string; uid: string }> =
    [];

  async createEmailPasswordUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ uid: string }> {
    if (!input.password || input.password.length < 6) {
      throw Object.assign(new Error("WEAK_PASSWORD"), { code: "WEAK_PASSWORD" });
    }
    const uid = `tm_${input.email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 18)}`;
    this.created.push({
      email: input.email,
      displayName: input.displayName,
      uid,
    });
    return { uid };
  }
}

/**
 * Identity Toolkit email/password signUp via Web API key (server-side).
 * Used when Admin Auth createUser is unavailable; CF still sets claims from Firestore.
 */
export function createIdentityToolkitSignUpAuthPort(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): TransportCompanyAuthCreatePort {
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiKey = input.apiKey.trim();
  return {
    async createEmailPasswordUser({ email, password, displayName }) {
      if (!apiKey) {
        throw Object.assign(new Error("FIREBASE_API_KEY_MISSING"), {
          code: "FIREBASE_API_KEY_MISSING",
        });
      }
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName,
          returnSecureToken: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        localId?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json.localId) {
        const msg = json.error?.message ?? `HTTP_${res.status}`;
        throw Object.assign(new Error(msg), {
          code: "AUTH_CREATE_FAILED",
          detail: msg,
        });
      }
      return { uid: json.localId };
    },
  };
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateTransportCompanyLoginFields(input: {
  email?: string | null;
  password?: string | null;
  displayName?: string | null;
}): { ok: true; email: string; password: string; displayName: string } | {
  ok: false;
  code: string;
  message: string;
} {
  const email = normalizeEmail(input.email ?? "");
  const password = (input.password ?? "").trim();
  const displayName = (input.displayName ?? "").trim();
  if (!displayName) {
    return { ok: false, code: "VALIDATION_FAILED", message: "displayName required" };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, code: "VALIDATION_FAILED", message: "valid email required" };
  }
  if (password.length < 6) {
    return {
      ok: false,
      code: "WEAK_PASSWORD",
      message: "password must be at least 6 characters",
    };
  }
  return { ok: true, email, password, displayName };
}

export async function provisionTransportCompanyLogin(
  input: TransportCompanyLoginInput,
  deps: {
    auth: TransportCompanyAuthCreatePort;
    writePort?: ProductionFirestoreWritePort | null;
    /** When true, skip live Auth and use Fake-style uid write only if writePort set. */
    allowOffline?: boolean;
  },
): Promise<TransportCompanyLoginResult> {
  const validated = validateTransportCompanyLoginFields(input);
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code,
      message: validated.message,
    };
  }

  let uid: string;
  let authProvisioned = false;
  try {
    const created = await deps.auth.createEmailPasswordUser({
      email: validated.email,
      password: validated.password,
      displayName: validated.displayName,
    });
    uid = created.uid;
    authProvisioned = true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "AUTH_CREATE_FAILED";
    if (!deps.allowOffline) {
      return {
        ok: false,
        code,
        message: err instanceof Error ? err.message : "auth create failed",
      };
    }
    uid = `tm_offline_${input.transportCompanyId}`.slice(0, 28);
    authProvisioned = false;
  }

  const companyPath = `transport_company/${input.transportCompanyId}`;
  const userFields: Record<string, unknown> = {
    isAdminRule: 4,
    IsAdminRule: 4,
    IsAdmin: false,
    isAdmin: false,
    email: validated.email,
    display_name: validated.displayName,
    transport_company: { path: companyPath },
    actev_user: true,
    admin_next_transport_manager: true,
    admin_next_correlation_id: input.correlationId,
  };
  if (input.phone?.trim()) userFields.phone = input.phone.trim();
  if (input.countryId?.trim()) {
    const cid = input.countryId.trim();
    const path = cid.includes("/") ? cid : `countries/${cid}`;
    userFields.Rev_dolh = { path };
    userFields.Rev_dloh_agent = { path };
  }

  let userDocWritten = false;
  let companyOwnerLinked = false;
  if (deps.writePort) {
    const existing = await deps.writePort.getDocument("user", uid);
    if (!existing.exists) {
      await deps.writePort.createDocument("user", uid, userFields);
    } else {
      await deps.writePort.updateDocument("user", uid, userFields, {
        allowCreate: true,
      });
    }
    userDocWritten = true;

    await deps.writePort.updateDocument(
      "transport_company",
      input.transportCompanyId,
      {
        owner_user: { path: `user/${uid}` },
        email: validated.email,
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      },
      { allowCreate: true },
    );
    companyOwnerLinked = true;
  }

  return {
    ok: true,
    uid,
    email: validated.email,
    authProvisioned,
    userDocWritten,
    companyOwnerLinked,
  };
}

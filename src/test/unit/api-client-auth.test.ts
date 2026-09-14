import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiFetchAuthError,
  applyClientApiAuthHeaders,
} from "@/lib/apiClient";
import {
  getClientAppEnv,
  isClientBearerAuthRequired,
} from "@/lib/clientAppEnv";
import {
  isFirebaseClientConfigured,
  readFirebaseWebConfigFromEnv,
} from "@/infrastructure/auth/firebaseClient";

describe("client api auth headers", () => {
  it("development attaches x-user-id and x-user-email", async () => {
    const headers = new Headers();
    await applyClientApiAuthHeaders(headers, {
      clientAppEnv: "development",
      userId: "user_super",
      email: "super@touri.local",
      correlationId: "corr-dev",
    });
    expect(headers.get("x-user-id")).toBe("user_super");
    expect(headers.get("x-user-email")).toBe("super@touri.local");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("x-correlation-id")).toBe("corr-dev");
  });

  it("development does not attach spoof trust headers", async () => {
    const headers = new Headers();
    await applyClientApiAuthHeaders(headers, {
      clientAppEnv: "development",
      userId: "user_super",
    });
    expect(headers.get("x-role")).toBeNull();
    expect(headers.get("x-country")).toBeNull();
    expect(headers.get("x-agent")).toBeNull();
  });

  it("production attaches Bearer Firebase ID token", async () => {
    const headers = new Headers();
    await applyClientApiAuthHeaders(headers, {
      clientAppEnv: "production",
      correlationId: "corr-prod",
      getIdToken: async () => "firebase-id-token-abc",
    });
    expect(headers.get("Authorization")).toBe("Bearer firebase-id-token-abc");
    expect(headers.get("x-user-id")).toBeNull();
    expect(headers.get("x-user-email")).toBeNull();
    expect(headers.get("x-correlation-id")).toBe("corr-prod");
  });

  it("staging uses Bearer auth (never x-user-id)", async () => {
    const headers = new Headers();
    await applyClientApiAuthHeaders(headers, {
      clientAppEnv: "staging",
      userId: "ignored",
      email: "ignored@touri.local",
      getIdToken: async () => "token-staging",
    });
    expect(headers.get("x-user-id")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer token-staging");
  });

  it("production fails cleanly when token is missing", async () => {
    const headers = new Headers();
    await expect(
      applyClientApiAuthHeaders(headers, {
        clientAppEnv: "production",
        getIdToken: async () => null,
      }),
    ).rejects.toBeInstanceOf(ApiFetchAuthError);
  });

  it("isClientBearerAuthRequired is false only in development", () => {
    expect(isClientBearerAuthRequired()).toBe(false);
    expect(getClientAppEnv()).toBe("development");
  });

  it("treats staging as bearer-required", () => {
    const prev = process.env.NEXT_PUBLIC_APP_ENV;
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    expect(isClientBearerAuthRequired()).toBe(true);
    expect(getClientAppEnv()).toBe("staging");
    process.env.NEXT_PUBLIC_APP_ENV = prev;
  });

  it("treats production as bearer-required", () => {
    const prev = process.env.NEXT_PUBLIC_APP_ENV;
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    expect(isClientBearerAuthRequired()).toBe(true);
    expect(getClientAppEnv()).toBe("production");
    process.env.NEXT_PUBLIC_APP_ENV = prev;
  });

  it("readFirebaseWebConfigFromEnv accepts injected env for tests", () => {
    expect(
      readFirebaseWebConfigFromEnv({
        NEXT_PUBLIC_FIREBASE_API_KEY: "k",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "d",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
        NEXT_PUBLIC_FIREBASE_APP_ID: "a",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "b",
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "s",
      }),
    ).toEqual({
      apiKey: "k",
      authDomain: "d",
      projectId: "p",
      appId: "a",
      storageBucket: "b",
      messagingSenderId: "s",
    });
    expect(
      isFirebaseClientConfigured({
        NEXT_PUBLIC_FIREBASE_API_KEY: "k",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "d",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
        NEXT_PUBLIC_FIREBASE_APP_ID: "a",
      }),
    ).toBe(true);
  });

  it("missing required NEXT_PUBLIC_FIREBASE_* fields yields null / not configured", () => {
    expect(readFirebaseWebConfigFromEnv({})).toBeNull();
    expect(isFirebaseClientConfigured({})).toBe(false);
    expect(
      readFirebaseWebConfigFromEnv({
        NEXT_PUBLIC_FIREBASE_API_KEY: "k",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "d",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
      }),
    ).toBeNull();
  });

  it("default env path uses static NEXT_PUBLIC_FIREBASE_* process.env refs", () => {
    const src = readFileSync(
      join(process.cwd(), "src/infrastructure/auth/firebaseClient.ts"),
      "utf8",
    );
    for (const key of [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    ]) {
      expect(src).toContain(`process.env.${key}`);
    }
    expect(src).not.toMatch(/process\.env\s+as\s+Record/);
    expect(src).not.toMatch(/const\s+env\s*=\s*process\.env/);
    expect(src).not.toMatch(/process\.env\s*\[/);
  });

  it("firebase client source never references private/secret keys", () => {
    const src = readFileSync(
      join(process.cwd(), "src/infrastructure/auth/firebaseClient.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/FIREBASE_PRIVATE_KEY|PRIVATE_KEY|client_email/);
  });

  it("ApiFetchAuthError exposes stable code", () => {
    expect(new ApiFetchAuthError().code).toBe("API_FETCH_AUTH");
  });
});

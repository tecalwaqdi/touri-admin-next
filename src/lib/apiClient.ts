"use client";

import { useCallback } from "react";
import { useAuth } from "@/auth/AuthContext";
import { getClientAppEnv } from "@/lib/clientAppEnv";

export class ApiFetchAuthError extends Error {
  readonly code = "API_FETCH_AUTH";
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "ApiFetchAuthError";
  }
}

export async function applyClientApiAuthHeaders(
  headers: Headers,
  options: {
    clientAppEnv?: string;
    userId?: string;
    email?: string;
    correlationId?: string;
    getIdToken?: () => Promise<string | null>;
  },
): Promise<void> {
  const clientAppEnv = options.clientAppEnv ?? getClientAppEnv();
  if (options.correlationId) {
    headers.set("x-correlation-id", options.correlationId);
  }

  if (clientAppEnv !== "development") {
    const token = options.getIdToken ? await options.getIdToken() : null;
    if (!token?.trim()) {
      throw new ApiFetchAuthError("Missing Firebase ID token for API request");
    }
    headers.set("Authorization", `Bearer ${token.trim()}`);
    return;
  }

  if (options.userId) headers.set("x-user-id", options.userId);
  if (options.email) headers.set("x-user-email", options.email);
}

/** Client fetch that attaches dev mock headers or production Bearer token. */
export function useApiFetch() {
  const { session, getIdToken } = useAuth();
  const userId = session.user?.id;
  const email = session.user?.email;
  const correlationId = session.correlationId;

  return useCallback(
    async function apiFetch(input: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      await applyClientApiAuthHeaders(headers, {
        userId,
        email,
        correlationId,
        getIdToken,
      });
      if (!headers.has("content-type") && init.body) {
        headers.set("content-type", "application/json");
      }
      return fetch(input, { ...init, headers });
    },
    [userId, email, correlationId, getIdToken],
  );
}

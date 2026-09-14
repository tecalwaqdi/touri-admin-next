"use client";

import { useCallback } from "react";
import { useAuth } from "@/auth/AuthContext";

/** Client fetch that attaches synthetic auth + correlation headers. */
export function useApiFetch() {
  const { session } = useAuth();
  const userId = session.user?.id;
  const email = session.user?.email;
  const correlationId = session.correlationId;

  return useCallback(
    async function apiFetch(input: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (userId) headers.set("x-user-id", userId);
      if (email) headers.set("x-user-email", email);
      if (correlationId) headers.set("x-correlation-id", correlationId);
      if (!headers.has("content-type") && init.body) {
        headers.set("content-type", "application/json");
      }
      return fetch(input, { ...init, headers });
    },
    [userId, email, correlationId],
  );
}

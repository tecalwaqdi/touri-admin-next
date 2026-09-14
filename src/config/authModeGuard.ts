/**
 * AUTH_MODE startup guard.
 * mock allowed ONLY in development (and vitest/test).
 * staging / production MUST use verified_token — mock FORBIDDEN.
 */

import type { AppEnvConfig } from "@/config/env";

export type AuthMode = "mock" | "verified_token";

export class AuthModeGuardError extends Error {
  readonly code = "AUTH_MODE_FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "AuthModeGuardError";
  }
}

export function assertAuthModeAllowed(env: {
  APP_ENV: AppEnvConfig["APP_ENV"];
  AUTH_MODE: AuthMode;
  NODE_ENV?: string;
}): void {
  const appEnv = env.APP_ENV;
  const mode = env.AUTH_MODE;

  if (mode === "mock" && (appEnv === "staging" || appEnv === "production")) {
    throw new AuthModeGuardError(
      `AUTH_MODE=mock is FORBIDDEN when APP_ENV=${appEnv}. Use AUTH_MODE=verified_token.`,
    );
  }

  if (
    mode !== "mock" &&
    mode !== "verified_token"
  ) {
    throw new AuthModeGuardError(
      `AUTH_MODE must be mock|verified_token (got: ${String(mode)})`,
    );
  }
}

export function isMockAuthAllowed(appEnv: AppEnvConfig["APP_ENV"]): boolean {
  return appEnv === "development";
}

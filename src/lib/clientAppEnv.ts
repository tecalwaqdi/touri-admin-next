export type ClientAppEnv = "development" | "staging" | "production";

/** Browser-visible app environment (NEXT_PUBLIC_APP_ENV). */
export function getClientAppEnv(): ClientAppEnv {
  const raw = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  if (raw === "staging" || raw === "production") return raw;
  return "development";
}

/** Staging/production browsers must use Firebase Bearer tokens, not mock headers. */
export function isClientBearerAuthRequired(): boolean {
  return getClientAppEnv() !== "development";
}

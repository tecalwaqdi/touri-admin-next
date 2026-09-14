/**
 * Server instrumentation — validate environment at startup.
 * Fails fast if dangerous production-write flags are enabled outside production,
 * or if AUTH_MODE=mock under staging/production.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("@/config/env");
    loadEnv();
  }
}

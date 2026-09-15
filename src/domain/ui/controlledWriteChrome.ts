/**
 * PC-8 write-action chrome policy.
 *
 * Controlled mutations are deferred to PC-9 for Production/staging operators.
 * Until NEXT_PUBLIC_CONTROLLED_WRITES_UI=true, mutation buttons / create CTAs
 * must not appear on Production or staging client builds.
 *
 * Development may still render chrome for local controlled-write rehearsal
 * (integration tests + synthetic paths). Permissions alone never imply writes
 * are live — API write gates remain authoritative.
 */
export function isControlledWriteChromeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "true") return true;
  if (process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "false") return false;
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  return appEnv !== "production" && appEnv !== "staging";
}

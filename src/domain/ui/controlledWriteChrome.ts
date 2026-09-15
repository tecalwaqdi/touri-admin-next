/**
 * PC-8/PC-9 write-action chrome policy.
 *
 * Mutation buttons / create CTAs must not appear on Production or staging
 * client builds unless NEXT_PUBLIC_CONTROLLED_WRITES_UI=true (visibility only).
 *
 * Development may render chrome for local controlled-write rehearsal
 * (integration tests + synthetic paths). Permissions alone never imply writes
 * are live — API write gates remain authoritative. Production write flags
 * must stay FALSE regardless of this chrome switch.
 */
export function isControlledWriteChromeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "true") return true;
  if (process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "false") return false;
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  return appEnv !== "production" && appEnv !== "staging";
}

/**
 * Conservative UI guard for notification compose audience `user_ids`.
 * Real-user broadcast is blocked unless ids look QA/noncanonical.
 * Server gates + Fake adapter remain authoritative — this is chrome only.
 */

const QA_OR_NONCANONICAL_USER_ID =
  /^(qa[_-]|test[_-]|fixture[_-]|synthetic[_-]|fake[_-])/i;

export function looksLikeQaOrNoncanonicalUserId(userId: string): boolean {
  const id = userId.trim();
  if (!id) return false;
  const lower = id.toLowerCase();
  if (QA_OR_NONCANONICAL_USER_ID.test(id)) return true;
  if (lower.includes("_qa_") || lower.includes("-qa-")) return true;
  if (lower.includes("fixture") || lower.includes("synthetic")) return true;
  return false;
}

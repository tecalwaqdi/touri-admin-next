/**
 * Safe operator-facing display name hierarchy (PC-3).
 * displayName → safe email/phone hint → shortened id.
 * Never prefer raw UID when a valid display name exists.
 */

export function shortenId(id: string | null | undefined, max = 10): string | null {
  if (!id) return null;
  const t = id.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export function looksLikeRawUid(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  // Firebase-ish UID: 20–36 alnum, or long hex-like
  if (/^[A-Za-z0-9_-]{20,36}$/.test(v) && !/\s/.test(v)) return true;
  return false;
}

export function resolveOperationalDisplayName(input: {
  displayName?: string | null;
  emailHint?: string | null;
  phoneHint?: string | null;
  id?: string | null;
}): string {
  const name = input.displayName?.trim();
  if (name && !looksLikeRawUid(name)) return name;
  const email = input.emailHint?.trim();
  if (email) return email;
  const phone = input.phoneHint?.trim();
  if (phone) return phone;
  if (name) return name;
  return shortenId(input.id) ?? "—";
}

export function safePartyDisplayRef(
  id: string | null | undefined,
): string | null {
  return shortenId(id);
}

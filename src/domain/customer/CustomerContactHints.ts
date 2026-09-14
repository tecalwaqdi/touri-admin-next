/**
 * Phase 4A-7 — Customer contact masking (hints only).
 * Examples: os***@example.com , ***1234
 * Never return raw phone/email when FULL_PII_SHADOW_ENABLED=false.
 */

/** Last-4 phone hint: ***1234 */
export function maskCustomerPhoneHint(
  phone: string | number | null | undefined,
): string | null {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

/** Local-prefix email hint: os***@example.com (first 2 local chars when available). */
export function maskCustomerEmailHint(
  email: string | null | undefined,
): string | null {
  if (email == null) return null;
  const raw = String(email).trim();
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at <= 0) return "***";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return "***";
  const prefix =
    local.length >= 2 ? local.slice(0, 2) : local.length === 1 ? local : "";
  return `${prefix}***@${domain}`;
}

export function extractCustomerPhoneRaw(
  data: Record<string, unknown>,
): string | null {
  const p = data.phone_number ?? data.phone;
  if (p != null && String(p).trim()) return String(p).trim();
  const n = data.phone_n;
  if (n != null && Number(n) !== 0) return String(n);
  return null;
}

export function extractCustomerEmailRaw(
  data: Record<string, unknown>,
): string | null {
  const e = data.email;
  if (e == null) return null;
  const s = String(e).trim();
  return s.length ? s : null;
}

/**
 * Phase 3.7 — Identity-sensitive masking utilities.
 * phone/email never corrupted when null/unknown.
 */

export function maskPhone(
  phone: string | null | undefined,
): string | null {
  if (phone == null) return null;
  const raw = String(phone).trim();
  if (!raw || raw.toLowerCase() === "unknown") return raw === "" ? null : raw;

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) {
    return "*".repeat(Math.max(raw.length, 1));
  }
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const middleLen = Math.max(digits.length - 4, 3);
  return `${head}${"*".repeat(middleLen)}${tail}`;
}

export function maskEmail(
  email: string | null | undefined,
): string | null {
  if (email == null) return null;
  const raw = String(email).trim();
  if (!raw || raw.toLowerCase() === "unknown") return raw === "" ? null : raw;

  const at = raw.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return "***";
  const localMasked =
    local.length === 1 ? "*" : `${local[0]}***`;
  return `${localMasked}@${domain}`;
}

export type PiiPresentationMode = "masked" | "full";

export function presentPhone(
  phone: string | null | undefined,
  mode: PiiPresentationMode,
): string | null {
  if (mode === "full") {
    if (phone == null) return null;
    const raw = String(phone).trim();
    return raw === "" ? null : raw;
  }
  return maskPhone(phone);
}

export function presentEmail(
  email: string | null | undefined,
  mode: PiiPresentationMode,
): string | null {
  if (mode === "full") {
    if (email == null) return null;
    const raw = String(email).trim();
    return raw === "" ? null : raw;
  }
  return maskEmail(email);
}

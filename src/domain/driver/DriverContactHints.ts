/**
 * Driver contact extraction + masking (hints by default).
 * Raw values only surface via drivers:read_pii projection at the API boundary.
 */

import {
  maskEmail,
  maskPhone,
  presentEmail,
  presentPhone,
  type PiiPresentationMode,
} from "@/domain/pii/maskIdentity";
import { resolveDriverPiiMode } from "@/domain/customer/CanonicalCustomerRead";
import type { Permission } from "@/types/roles";

export function extractDriverPhoneRaw(
  data: Record<string, unknown>,
): string | null {
  const p = data.phone_number ?? data.phone ?? data.Phone ?? data.mobile;
  if (p != null && String(p).trim()) return String(p).trim();
  const n = data.phone_n;
  if (n != null && Number(n) !== 0) return String(n);
  return null;
}

export function extractDriverEmailRaw(
  data: Record<string, unknown>,
): string | null {
  const e = data.email ?? data.Email ?? data.email_address;
  if (e == null) return null;
  const s = String(e).trim();
  return s.length ? s : null;
}

/** Masked phone hint for safe read models (never raw). */
export function maskDriverPhoneHint(
  phone: string | number | null | undefined,
): string | null {
  return maskPhone(phone == null ? null : String(phone));
}

/** Masked email hint for safe read models (never raw). */
export function maskDriverEmailHint(
  email: string | null | undefined,
): string | null {
  return maskEmail(email);
}

export type DriverContactProjection = {
  phone: string | null;
  email: string | null;
  mode: PiiPresentationMode;
  redacted: boolean;
  phonePresent: boolean;
  emailPresent: boolean;
};

/**
 * Project driver contacts for Admin UI.
 * drivers:read alone → masked hints; drivers:read_pii → full values.
 */
export function projectDriverContact(
  data: Record<string, unknown>,
  permissions: Permission[],
): DriverContactProjection {
  const rawPhone = extractDriverPhoneRaw(data);
  const rawEmail = extractDriverEmailRaw(data);
  const hasRead =
    permissions.includes("drivers:read") ||
    permissions.includes("drivers:read_pii");
  if (!hasRead) {
    return {
      phone: null,
      email: null,
      mode: "masked",
      redacted: true,
      phonePresent: rawPhone != null,
      emailPresent: rawEmail != null,
    };
  }
  const mode = resolveDriverPiiMode(permissions);
  return {
    phone: presentPhone(rawPhone, mode),
    email: presentEmail(rawEmail, mode),
    mode,
    redacted: mode === "masked",
    phonePresent: rawPhone != null,
    emailPresent: rawEmail != null,
  };
}

/**
 * Support ticket domain — Legacy Firestore `support` collection.
 * Fields: naim (name), osf (description), data (created), halh (status),
 * RefUser, phone, tsnef (classification), Rev_dolh (country).
 */

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"
  | "unknown";

export type SupportTicketListItem = {
  id: string;
  subject: string | null;
  descriptionPreview: string | null;
  status: SupportTicketStatus;
  category: string | null;
  countryId: string | null;
  customerUserId: string | null;
  phoneMasked: string | null;
  createdAtUtc: string | null;
  driverId: string | null;
  tripId: string | null;
};

export type SupportTicketDetail = SupportTicketListItem & {
  description: string | null;
  assignedAdminId: string | null;
  updatedAtUtc: string | null;
  priority: string | null;
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function refId(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) {
    const parts = v.trim().split("/").filter(Boolean);
    return parts[parts.length - 1] ?? v.trim();
  }
  if (v && typeof v === "object") {
    const o = v as { id?: unknown; path?: unknown };
    if (typeof o.id === "string" && o.id.trim()) return o.id.trim();
    if (typeof o.path === "string" && o.path.trim()) {
      const parts = o.path.trim().split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    }
  }
  return null;
}

function maskPhone(v: unknown): string | null {
  const raw =
    typeof v === "number"
      ? String(v)
      : typeof v === "string"
        ? v.trim()
        : "";
  if (!raw) return null;
  if (raw.length <= 4) return "*".repeat(raw.length);
  return `${raw.slice(0, 2)}${"*".repeat(Math.max(raw.length - 4, 3))}${raw.slice(-2)}`;
}

function mapStatus(raw: unknown): SupportTicketStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "unknown";
  if (s.includes("open") || s === "new" || s === "0") return "open";
  if (s.includes("progress") || s === "1") return "in_progress";
  if (s.includes("resolv") || s === "2") return "resolved";
  if (s.includes("close") || s === "3") return "closed";
  return "unknown";
}

function asUtc(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export function mapSupportDocumentToListItem(input: {
  id: string;
  data: Record<string, unknown>;
}): SupportTicketListItem {
  const { id, data } = input;
  const description = str(data.osf) ?? str(data.description) ?? str(data.body);
  return {
    id,
    subject: str(data.naim) ?? str(data.subject) ?? str(data.title),
    descriptionPreview: description
      ? description.slice(0, 120)
      : null,
    status: mapStatus(data.halh ?? data.status),
    category: str(data.tsnef) ?? str(data.category),
    countryId: refId(data.Rev_dolh ?? data.countryRef ?? data.country_id),
    customerUserId: refId(data.RefUser ?? data.userRef ?? data.user_id),
    phoneMasked: maskPhone(data.phone),
    createdAtUtc: asUtc(data.data ?? data.createdAt ?? data.created_at),
    driverId: refId(data.driverId ?? data.driver_id ?? data.RefDriver),
    tripId: refId(data.orderId ?? data.bookingId ?? data.tripId),
  };
}

export function mapSupportDocumentToDetail(input: {
  id: string;
  data: Record<string, unknown>;
}): SupportTicketDetail {
  const base = mapSupportDocumentToListItem(input);
  return {
    ...base,
    description: str(input.data.osf) ?? str(input.data.description),
    assignedAdminId: refId(
      input.data.assignedAdminId ?? input.data.assigned_to,
    ),
    updatedAtUtc: asUtc(input.data.updatedAt ?? input.data.updated_at),
    priority: str(input.data.priority),
  };
}

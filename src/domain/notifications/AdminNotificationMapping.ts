/**
 * Admin panel notifications — Legacy `admin_panel_notifications`.
 */

export type NotificationCategory =
  | "drivers"
  | "operations"
  | "support"
  | "finance"
  | "system";

export type AdminNotificationListItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  category: NotificationCategory;
  unread: boolean;
  createdAtUtc: string | null;
  driverId: string | null;
  bookingId: string | null;
  supportId: string | null;
  countryId: string | null;
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asUtc(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function categoryForType(type: string): NotificationCategory {
  const t = type.toLowerCase();
  if (
    t.includes("driver") ||
    t.includes("registration") ||
    t.includes("document") ||
    t.includes("resubmit")
  ) {
    return "drivers";
  }
  if (t.includes("support") || t.includes("ticket")) return "support";
  if (
    t.includes("finance") ||
    t.includes("cash") ||
    t.includes("settlement") ||
    t.includes("reconcil")
  ) {
    return "finance";
  }
  if (t.includes("booking") || t.includes("order") || t.includes("trip")) {
    return "operations";
  }
  return "system";
}

export function mapAdminNotificationDocument(input: {
  id: string;
  data: Record<string, unknown>;
}): AdminNotificationListItem {
  const type = str(input.data.type) ?? "system";
  const category = categoryForType(type);
  return {
    id: input.id,
    type,
    title:
      str(input.data.title) ??
      (category === "drivers"
        ? "Driver registration pending"
        : category === "support"
          ? "Support ticket"
          : category === "finance"
            ? "Finance alert"
            : category === "operations"
              ? "Operations alert"
              : "System notification"),
    subtitle: str(input.data.subtitle) ?? str(input.data.body),
    category,
    unread: input.data.unread === true || input.data.read !== true,
    createdAtUtc: asUtc(input.data.createdAt ?? input.data.created_at),
    driverId: str(input.data.driverId ?? input.data.driver_id),
    bookingId: str(
      input.data.bookingId ?? input.data.orderId ?? input.data.tripId,
    ),
    supportId: str(input.data.supportId ?? input.data.ticketId),
    countryId: (() => {
      const ref = input.data.countryRef ?? input.data.country_id;
      if (typeof ref === "string") {
        const parts = ref.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? ref;
      }
      if (ref && typeof ref === "object" && "path" in (ref as object)) {
        const path = String((ref as { path: string }).path);
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? null;
      }
      return null;
    })(),
  };
}

/**
 * Phase 4A-5 — Driver document/compliance safe summary.
 * present | missing | unknown only — NEVER URLs, ID numbers, or image bytes.
 * Evidence: driver_registration_document_status.dart (presence checks only).
 */

export type DocPresence = "present" | "missing" | "unknown";

export type DriverDocSlotSummary = {
  slot:
    | "profile_photo"
    | "national_id"
    | "vehicle_registration"
    | "driver_license"
    | "vehicle_photo";
  presence: DocPresence;
  /** Evidence field(s) inspected — never includes values. */
  evidenceFields: string[];
};

export type DriverComplianceSafeSummary = {
  overall:
    | "ready"
    | "incomplete"
    | "expired"
    | "unknown";
  registrationDocumentsStatus: string | null;
  slots: DriverDocSlotSummary[];
  /** Expiry known only when explicit date fields exist — never invent. */
  hasKnownExpiry: boolean;
  expiredSlotCount: number;
};

function hasHttpsUrl(v: unknown): boolean {
  return typeof v === "string" && v.trim().startsWith("https://");
}

function hasStoragePath(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const p = v.trim();
  return p.startsWith("users/") && !p.includes("..");
}

function slotPresent(data: Record<string, unknown>, v2Key: string, legacyKey: string): DocPresence {
  const slot = data[v2Key];
  if (slot && typeof slot === "object") {
    const m = slot as Record<string, unknown>;
    if (hasStoragePath(m.storagePath) || hasHttpsUrl(m.url)) return "present";
    // Slot object exists but empty → missing (explicit structure)
    if (Object.keys(m).length === 0) return "missing";
    if (m.storagePath == null && m.url == null) return "missing";
  }
  if (hasHttpsUrl(data[legacyKey]) || hasStoragePath(data[legacyKey])) {
    return "present";
  }
  // If neither V2 nor legacy key exists at all → unknown (cannot prove missing)
  if (!(v2Key in data) && !(legacyKey in data)) return "unknown";
  return "missing";
}

function licensePresent(data: Record<string, unknown>): DocPresence {
  const front = slotPresent(data, "doc_driver_license_front", "img_id");
  const legacy = slotPresent(data, "doc_driver_license", "img_id");
  if (front === "present" || legacy === "present") return "present";
  if (front === "missing" || legacy === "missing") return "missing";
  return "unknown";
}

function isExpiredDate(v: unknown, now: Date): boolean {
  if (v == null) return false;
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "string" || typeof v === "number") {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  } else if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    d = (v as { toDate: () => Date }).toDate();
  }
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

/**
 * Safe compliance summary — no URL/path/ID number values returned.
 */
export function buildDriverComplianceSafeSummary(
  data: Record<string, unknown>,
  now: Date = new Date(),
): DriverComplianceSafeSummary {
  const slots: DriverDocSlotSummary[] = [
    {
      slot: "profile_photo",
      presence: slotPresent(data, "doc_profile_photo", "photo_url"),
      evidenceFields: ["doc_profile_photo", "photo_url"],
    },
    {
      slot: "national_id",
      presence: slotPresent(data, "doc_national_id", "img_id_rksh"),
      evidenceFields: ["doc_national_id", "img_id_rksh"],
    },
    {
      slot: "vehicle_registration",
      presence: slotPresent(data, "doc_vehicle_registration", "img_id_car"),
      evidenceFields: ["doc_vehicle_registration", "img_id_car"],
    },
    {
      slot: "driver_license",
      presence: licensePresent(data),
      evidenceFields: [
        "doc_driver_license_front",
        "doc_driver_license",
        "img_id",
      ],
    },
    {
      slot: "vehicle_photo",
      presence: slotPresent(data, "doc_vehicle_photo", "img_id_car"),
      evidenceFields: ["doc_vehicle_photo", "img_id_car"],
    },
  ];

  const docsStatus =
    typeof data.registration_documents_status === "string"
      ? data.registration_documents_status.trim().toLowerCase() || null
      : null;

  const expiryKeys = [
    "driver_license_expiry",
    "national_id_expiry",
    "vehicle_registration_expiry",
    "doc_driver_license_front.expiryDate",
  ];
  let hasKnownExpiry = false;
  let expiredSlotCount = 0;
  for (const key of ["driver_license_expiry", "national_id_expiry", "vehicle_registration_expiry"]) {
    if (key in data && data[key] != null) {
      hasKnownExpiry = true;
      if (isExpiredDate(data[key], now)) expiredSlotCount += 1;
    }
  }
  void expiryKeys;

  let overall: DriverComplianceSafeSummary["overall"] = "unknown";
  if (docsStatus === "complete") overall = "ready";
  else if (docsStatus === "expired") overall = "expired";
  else if (
    docsStatus === "missing" ||
    docsStatus === "needs_reupload" ||
    docsStatus === "incomplete"
  ) {
    overall = "incomplete";
  } else if (expiredSlotCount > 0) {
    overall = "expired";
  } else {
    const known = slots.filter((s) => s.presence !== "unknown");
    if (known.length === 0) overall = "unknown";
    else if (known.every((s) => s.presence === "present")) overall = "ready";
    else if (known.some((s) => s.presence === "missing")) overall = "incomplete";
  }

  return {
    overall,
    registrationDocumentsStatus: docsStatus,
    slots,
    hasKnownExpiry,
    expiredSlotCount,
  };
}

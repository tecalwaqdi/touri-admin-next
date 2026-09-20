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
  /** Slot-level review when present on V2 doc object — never invent. */
  reviewStatus: string | null;
  /** ISO expiry when explicit date field exists — never invent. */
  expiryUtc: string | null;
  expired: boolean;
  /** Uploaded metadata presence only (no URL/path values). */
  uploadedMetadataPresent: boolean;
  rejectionReasonPresent: boolean;
};

export type DriverComplianceSafeSummary = {
  overall:
    | "ready"
    | "incomplete"
    | "expired"
    | "unknown";
  registrationDocumentsStatus: string | null;
  documentReviewStatus: string | null;
  rejectionReasonPresent: boolean;
  needsChangesReasonPresent: boolean;
  /** Operator-authored reason text when present — never Storage URLs / ID numbers. */
  rejectionReasonText: string | null;
  needsChangesReasonText: string | null;
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

function slotMeta(data: Record<string, unknown>, v2Key: string): {
  reviewStatus: string | null;
  expiryUtc: string | null;
  expired: boolean;
  uploadedMetadataPresent: boolean;
  rejectionReasonPresent: boolean;
} {
  const slot = data[v2Key];
  if (!slot || typeof slot !== "object") {
    return {
      reviewStatus: null,
      expiryUtc: null,
      expired: false,
      uploadedMetadataPresent: false,
      rejectionReasonPresent: false,
    };
  }
  const m = slot as Record<string, unknown>;
  const review =
    typeof m.reviewStatus === "string"
      ? m.reviewStatus.trim() || null
      : typeof m.status === "string"
        ? m.status.trim() || null
        : null;
  const expiryRaw = m.expiryDate ?? m.expiry_date;
  let expiryUtc: string | null = null;
  if (expiryRaw instanceof Date) expiryUtc = expiryRaw.toISOString();
  else if (typeof expiryRaw === "string" || typeof expiryRaw === "number") {
    const d = new Date(expiryRaw);
    if (!Number.isNaN(d.getTime())) expiryUtc = d.toISOString();
  } else if (
    expiryRaw &&
    typeof expiryRaw === "object" &&
    "toDate" in expiryRaw &&
    typeof (expiryRaw as { toDate: () => Date }).toDate === "function"
  ) {
    expiryUtc = (expiryRaw as { toDate: () => Date }).toDate().toISOString();
  }
  const expired = expiryUtc ? new Date(expiryUtc).getTime() < Date.now() : false;
  return {
    reviewStatus: review,
    expiryUtc,
    expired,
    uploadedMetadataPresent:
      hasStoragePath(m.storagePath) ||
      hasHttpsUrl(m.url) ||
      typeof m.contentType === "string" ||
      typeof m.uploadedAt === "string",
    rejectionReasonPresent:
      (typeof m.rejectionReason === "string" && m.rejectionReason.trim().length > 0) ||
      (typeof m.rejection_reason === "string" && m.rejection_reason.trim().length > 0),
  };
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
  const buildSlot = (
    slot: DriverDocSlotSummary["slot"],
    v2Key: string,
    legacyKey: string,
    presenceOverride?: DocPresence,
  ): DriverDocSlotSummary => {
    const meta = slotMeta(data, v2Key);
    return {
      slot,
      presence: presenceOverride ?? slotPresent(data, v2Key, legacyKey),
      evidenceFields: [v2Key, legacyKey],
      ...meta,
    };
  };

  const slots: DriverDocSlotSummary[] = [
    buildSlot("profile_photo", "doc_profile_photo", "photo_url"),
    buildSlot("national_id", "doc_national_id", "img_id_rksh"),
    buildSlot("vehicle_registration", "doc_vehicle_registration", "img_id_car"),
    {
      ...buildSlot("driver_license", "doc_driver_license_front", "img_id", licensePresent(data)),
      evidenceFields: [
        "doc_driver_license_front",
        "doc_driver_license",
        "img_id",
      ],
    },
    buildSlot("vehicle_photo", "doc_vehicle_photo", "img_id_car"),
  ];

  const docsStatus =
    typeof data.registration_documents_status === "string"
      ? data.registration_documents_status.trim().toLowerCase() || null
      : null;
  const documentReviewStatus =
    typeof data.document_review_status === "string"
      ? data.document_review_status.trim().toLowerCase() || null
      : null;
  const rejectionReasonText =
    typeof data.rejection_reason === "string"
      ? data.rejection_reason.trim().slice(0, 280) || null
      : null;
  const needsChangesReasonText =
    typeof data.needs_changes_reason === "string"
      ? data.needs_changes_reason.trim().slice(0, 280) || null
      : null;
  const rejectionReasonPresent =
    Boolean(rejectionReasonText) ||
    slots.some((s) => s.rejectionReasonPresent);
  const needsChangesReasonPresent = Boolean(needsChangesReasonText);

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
    documentReviewStatus,
    rejectionReasonPresent,
    needsChangesReasonPresent,
    rejectionReasonText,
    needsChangesReasonText,
    slots,
    hasKnownExpiry,
    expiredSlotCount,
  };
}

/**
 * Phase 3.7 — Sensitive field registry (code mirror of SENSITIVE_FIELD_REGISTRY.md).
 */

export type SensitivityClass =
  | "public_admin"
  | "operational_sensitive"
  | "financial_sensitive"
  | "identity_sensitive";

export type SensitiveFieldRow = {
  field: string;
  resource: string;
  sensitivity: SensitivityClass;
  readPermission?: string;
  piiPermission?: string;
  notes: string;
};

export const SENSITIVE_FIELD_REGISTRY: SensitiveFieldRow[] = [
  {
    field: "phone",
    resource: "customer",
    sensitivity: "identity_sensitive",
    readPermission: "customers:read",
    piiPermission: "customers:read_pii",
    notes: "Masked hint only (***1234) — FULL_PII_SHADOW stays false in 4A-7",
  },
  {
    field: "email",
    resource: "customer",
    sensitivity: "identity_sensitive",
    readPermission: "customers:read",
    piiPermission: "customers:read_pii",
    notes: "Masked hint only (os***@example.com) — FULL_PII_SHADOW stays false",
  },
  {
    field: "phone_number",
    resource: "customer",
    sensitivity: "identity_sensitive",
    piiPermission: "customers:read_pii",
    notes: "Legacy user.phone_number — DO_NOT_EXPOSE raw; hint only",
  },
  {
    field: "phone_n",
    resource: "customer",
    sensitivity: "identity_sensitive",
    piiPermission: "customers:read_pii",
    notes: "Legacy int phone — DO_NOT_EXPOSE raw",
  },
  {
    field: "address",
    resource: "customer",
    sensitivity: "identity_sensitive",
    notes: "Embedded address structs — DO_NOT_EXPOSE",
  },
  {
    field: "adresslist",
    resource: "customer",
    sensitivity: "identity_sensitive",
    notes: "Address list — DO_NOT_EXPOSE",
  },
  {
    field: "photo_url",
    resource: "customer",
    sensitivity: "identity_sensitive",
    notes: "Profile photo URL — DO_NOT_EXPOSE",
  },
  {
    field: "fcm_token",
    resource: "customer",
    sensitivity: "identity_sensitive",
    notes: "Push token — DO_NOT_EXPOSE",
  },
  {
    field: "password",
    resource: "customer",
    sensitivity: "identity_sensitive",
    notes: "Credential — DO_NOT_EXPOSE",
  },
  {
    field: "phone",
    resource: "driver",
    sensitivity: "identity_sensitive",
    readPermission: "drivers:read",
    piiPermission: "drivers:read_pii",
    notes: "Masked unless drivers:read_pii — FULL_PII_SHADOW stays false",
  },
  {
    field: "email",
    resource: "driver",
    sensitivity: "identity_sensitive",
    readPermission: "drivers:read",
    piiPermission: "drivers:read_pii",
    notes: "Masked unless drivers:read_pii",
  },
  {
    field: "phone_number",
    resource: "driver",
    sensitivity: "identity_sensitive",
    piiPermission: "drivers:read_pii",
    notes: "Legacy user.phone_number — DO_NOT_EXPOSE on CanonicalDriverReadModel",
  },
  {
    field: "phone_n",
    resource: "driver",
    sensitivity: "identity_sensitive",
    piiPermission: "drivers:read_pii",
    notes: "Legacy int phone — DO_NOT_EXPOSE",
  },
  {
    field: "ID_hoyh_MNDOB",
    resource: "driver",
    sensitivity: "identity_sensitive",
    notes: "National ID number — DO_NOT_EXPOSE",
  },
  {
    field: "img_id",
    resource: "driver",
    sensitivity: "identity_sensitive",
    notes: "Document image URL — presence only, never URL",
  },
  {
    field: "img_id_rksh",
    resource: "driver",
    sensitivity: "identity_sensitive",
    notes: "National ID image URL — presence only",
  },
  {
    field: "img_id_car",
    resource: "driver",
    sensitivity: "identity_sensitive",
    notes: "Vehicle reg image URL — presence only",
  },
  {
    field: "number_lohh_car",
    resource: "driver",
    sensitivity: "operational_sensitive",
    notes: "Plate — masked on CanonicalDriverReadModel (normalized_plate not proven)",
  },
  {
    field: "ipanBank",
    resource: "driver",
    sensitivity: "financial_sensitive",
    notes: "IBAN — DO_NOT_EXPOSE; Finance blocked",
  },
  {
    field: "bankIdAcc",
    resource: "driver",
    sensitivity: "financial_sensitive",
    notes: "Bank account — DO_NOT_EXPOSE",
  },
  {
    field: "loceshnMndobNow",
    resource: "driver",
    sensitivity: "operational_sensitive",
    notes: "Live GPS — never invent geography; not on ops read model",
  },
  {
    field: "customerId",
    resource: "trip",
    sensitivity: "identity_sensitive",
    readPermission: "trips:read",
    notes: "Safe string id only — never resolve PII in trip read path",
  },
  {
    field: "driverId",
    resource: "trip",
    sensitivity: "identity_sensitive",
    readPermission: "trips:read",
    notes: "Safe string id only — never resolve PII in trip read path",
  },
  {
    field: "phone_numper",
    resource: "trip",
    sensitivity: "identity_sensitive",
    piiPermission: "customers:read_pii",
    notes: "Legacy customer phone on order — DO_NOT_EXPOSE on CanonicalTripReadModel",
  },
  {
    field: "phone_nu_mndob",
    resource: "trip",
    sensitivity: "identity_sensitive",
    piiPermission: "drivers:read_pii",
    notes: "Legacy driver phone on order — DO_NOT_EXPOSE",
  },
  {
    field: "naim_user_text",
    resource: "trip",
    sensitivity: "identity_sensitive",
    notes: "Customer display name denormalized — DO_NOT_EXPOSE (FULL_PII_SHADOW false)",
  },
  {
    field: "naim_mndob_text",
    resource: "trip",
    sensitivity: "identity_sensitive",
    notes: "Driver display name denormalized — DO_NOT_EXPOSE",
  },
  {
    field: "imgProfileClent",
    resource: "trip",
    sensitivity: "identity_sensitive",
    notes: "Customer profile image URL — DO_NOT_EXPOSE",
  },
  {
    field: "img_mndob",
    resource: "trip",
    sensitivity: "identity_sensitive",
    notes: "Driver image URL — DO_NOT_EXPOSE",
  },
  {
    field: "ngeniusOrderId",
    resource: "trip",
    sensitivity: "financial_sensitive",
    notes: "Payment gateway reference — DO_NOT_EXPOSE on operational trip read",
  },
  {
    field: "idMoyser",
    resource: "trip",
    sensitivity: "financial_sensitive",
    notes: "Legacy Moyasar reference — DO_NOT_EXPOSE",
  },
  {
    field: "total_app",
    resource: "trip",
    sensitivity: "financial_sensitive",
    readPermission: "trips:read",
    notes: "Persisted historical platform fee — MoneyKnowledge only; not settlement",
  },
  {
    field: "total_vat",
    resource: "trip",
    sensitivity: "financial_sensitive",
    readPermission: "trips:read",
    notes: "Persisted historical VAT amount — not rate recompute",
  },
  {
    field: "total_mndob",
    resource: "trip",
    sensitivity: "financial_sensitive",
    readPermission: "trips:read",
    notes: "Persisted historical driver net — not accounting approval",
  },
  {
    field: "refundAmount",
    resource: "financial_trip",
    sensitivity: "financial_sensitive",
    notes: "DO_NOT_EXPOSE_YET",
  },
  {
    field: "chargebackAmount",
    resource: "financial_trip",
    sensitivity: "financial_sensitive",
    notes: "DO_NOT_EXPOSE_YET",
  },
  {
    field: "gatewayFee",
    resource: "financial_trip",
    sensitivity: "financial_sensitive",
    notes: "DO_NOT_EXPOSE_YET",
  },
  {
    field: "adjustmentAmount",
    resource: "financial_trip",
    sensitivity: "financial_sensitive",
    notes: "DO_NOT_EXPOSE_YET",
  },
  // Phase 4A-3 landmark (Legacy mkan) — never on CanonicalLandmarkReadModel
  {
    field: "EmailUser",
    resource: "landmark",
    sensitivity: "identity_sensitive",
    readPermission: "geography:read",
    piiPermission: "customers:read_pii",
    notes: "Legacy mkan.EmailUser — DO_NOT_EXPOSE on landmark read model",
  },
  {
    field: "user_malk",
    resource: "landmark",
    sensitivity: "identity_sensitive",
    notes: "Owner DocumentReference — DO_NOT_EXPOSE",
  },
  {
    field: "userRev",
    resource: "landmark",
    sensitivity: "identity_sensitive",
    notes: "Reviewer DocumentReference — DO_NOT_EXPOSE",
  },
  {
    field: "img1",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "Raw URL — expose LandmarkImageSummary only (no signed URL)",
  },
  {
    field: "img2",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "Raw URL — LandmarkImageSummary only",
  },
  {
    field: "img3",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "Raw URL — LandmarkImageSummary only",
  },
  {
    field: "img",
    resource: "city",
    sensitivity: "operational_sensitive",
    notes: "Legacy villages cover image URL — CityImageSummary / secure proxy only",
  },
  {
    field: "img",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "Legacy single-image alias — LandmarkImageSummary only",
  },
  {
    field: "ser",
    resource: "landmark",
    sensitivity: "financial_sensitive",
    notes: "Legacy price-like field on mkan — DO_NOT_EXPOSE_YET",
  },
  {
    field: "pdf",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "PDF URL — DO_NOT_EXPOSE on landmark read model",
  },
  {
    field: "pdfKtab",
    resource: "landmark",
    sensitivity: "operational_sensitive",
    notes: "PDF URL — DO_NOT_EXPOSE on landmark read model",
  },
  {
    field: "phone_number",
    resource: "agent",
    sensitivity: "identity_sensitive",
    piiPermission: "agents:read_pii",
    notes: "Legacy user.phone_number — DO_NOT_EXPOSE on CanonicalAgentReadModel",
  },
  {
    field: "email",
    resource: "agent",
    sensitivity: "identity_sensitive",
    piiPermission: "agents:read_pii",
    notes: "Agent email — DO_NOT_EXPOSE; FULL_PII_SHADOW stays false",
  },
  {
    field: "agent_geo_center",
    resource: "agent",
    sensitivity: "operational_sensitive",
    notes: "GPS center — never invent geography; blocked on read model",
  },
  {
    field: "Agent_total",
    resource: "agent",
    sensitivity: "financial_sensitive",
    notes: "Commission % DOCUMENT_ONLY — not settlement-safe",
  },
  {
    field: "app_commission_percent",
    resource: "agent",
    sensitivity: "financial_sensitive",
    notes: "Stored platform rate DOCUMENT_ONLY — not trip SoT",
  },
  {
    field: "vat_percent",
    resource: "agent",
    sensitivity: "financial_sensitive",
    notes: "Stored VAT % DOCUMENT_ONLY — not trip VAT SoT",
  },
];

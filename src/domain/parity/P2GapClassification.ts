/**
 * P2 remaining-gap classification (post P0+P1).
 * Only class A items are implemented in the P2 code session.
 *
 * A SHOULD_IMPLEMENT | B SUPERSEDED | C OBSOLETE | D UNSAFE_LEGACY
 * E NOT_CURRENT_PRODUCT | F DUPLICATE
 */

export type P2GapClass =
  | "A_SHOULD_IMPLEMENT"
  | "B_SUPERSEDED"
  | "C_OBSOLETE"
  | "D_UNSAFE_LEGACY"
  | "E_NOT_CURRENT_PRODUCT"
  | "F_DUPLICATE";

export type P2GapRow = {
  id: string;
  legacySurface: string;
  capability: string;
  kind: "read" | "write" | "report" | "storage" | "action" | "ux";
  dataSource: string;
  nextReplacement: string;
  classification: P2GapClass;
  proof: string;
  operatorValue: "high" | "medium" | "low" | "none";
};

export const P2_GAP_CLASSIFICATION: readonly P2GapRow[] = [
  {
    id: "P2-SUP-FILTER",
    legacySurface: "/adminSuport",
    capability: "Support list status/country/search filters + pagination UX",
    kind: "ux",
    dataSource: "support",
    nextReplacement: "/support FilterBar + loaded-page filter",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "Legacy status chips; Next list had no filters",
    operatorValue: "high",
  },
  {
    id: "P2-NOTIF-UNREAD",
    legacySurface: "/adminNotifications",
    capability: "Unread/read inbox filter",
    kind: "ux",
    dataSource: "admin_panel_notifications",
    nextReplacement: "/notifications unread filter",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "Legacy FilterChip unread/all; Next list unfiltered",
    operatorValue: "high",
  },
  {
    id: "P2-DRV-DOC-PREVIEW",
    legacySurface: "driverProfile documents",
    capability: "Document binary preview (Fake signed URL offline)",
    kind: "storage",
    dataSource: "Firebase Storage (canonical path)",
    nextReplacement: "GET /api/storage/driver-documents + detail UI",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "P1 storage workflow existed; detail UI lacked preview action",
    operatorValue: "high",
  },
  {
    id: "P2-SUP-LINKS",
    legacySurface: "support drawer",
    capability: "Trip/customer/driver deep links from ticket detail",
    kind: "ux",
    dataSource: "support refs",
    nextReplacement: "/support/[id] DetailNavLink targets",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "IDs shown as plain text without navigation",
    operatorValue: "medium",
  },
  {
    id: "P2-TRIP-CITY",
    legacySurface: "/adminALLhgZ",
    capability: "Trips city filter UI (API already supports cityId)",
    kind: "ux",
    dataSource: "order",
    nextReplacement: "/trips city filter control",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "API cityId unused by TripsPage",
    operatorValue: "medium",
  },
  {
    id: "P2-DRV-CITY",
    legacySurface: "/drever filters",
    capability: "Drivers city filter UI",
    kind: "ux",
    dataSource: "user",
    nextReplacement: "/drivers city filter control",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "API cityId unused by DriversPage",
    operatorValue: "medium",
  },
  {
    id: "P2-VEH-FILTER",
    legacySurface: "/admintypecar",
    capability: "Vehicle catalog search + active status filter",
    kind: "ux",
    dataSource: "type_car",
    nextReplacement: "/vehicle-catalog FilterBar",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "Legacy status/class chips; Next list unfiltered",
    operatorValue: "medium",
  },
  {
    id: "P2-CUST-UX",
    legacySurface: "/adminuser",
    capability: "Customers FilterBar + localized account-state labels",
    kind: "ux",
    dataSource: "user",
    nextReplacement: "CustomersPage adminUi FilterBar",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "Inconsistent chrome vs other lists; raw enum labels",
    operatorValue: "medium",
  },
  {
    id: "P2-GEO-REGION-ID",
    legacySurface: "addVill / edetVill",
    capability: "City create requires regionId parent",
    kind: "write",
    dataSource: "villages",
    nextReplacement: "GeographyCreatePanel regionId metadata",
    classification: "A_SHOULD_IMPLEMENT",
    proof: "Create chrome lacked region parent field",
    operatorValue: "medium",
  },
  {
    id: "P2-HARD-DELETE",
    legacySurface: "admin_cascade_delete",
    capability: "Cascade hard delete geo/storage",
    kind: "write",
    dataSource: "geo + storage",
    nextReplacement: "activate/deactivate/archive (DeleteArchiveMapping)",
    classification: "B_SUPERSEDED",
    proof: "src/domain/archive/DeleteArchiveMapping.ts",
    operatorValue: "none",
  },
  {
    id: "P2-PDF",
    legacySurface: "adminFinanceReports PDF",
    capability: "Legacy finance PDF exporters",
    kind: "report",
    dataSource: "financial_*",
    nextReplacement: "A4 printable settlement HTML + CSV",
    classification: "B_SUPERSEDED",
    proof: "LEGACY_FINANCE_PDF_STATUS INTENTIONALLY_SUPERSEDED",
    operatorValue: "none",
  },
  {
    id: "P2-DIRECT-FS",
    legacySurface: "client Firestore patches",
    capability: "Direct admin Firestore mutation",
    kind: "write",
    dataSource: "various",
    nextReplacement: "Controlled write services + gates",
    classification: "B_SUPERSEDED",
    proof: "Pc9ControlledWriteInventory / P1WriteGates",
    operatorValue: "none",
  },
  {
    id: "P2-RAW-FINANCE",
    legacySurface: "finance hub raw sums",
    capability: "Client-side finance totals",
    kind: "report",
    dataSource: "order/wallets",
    nextReplacement: "FR1–FR7 canonical reporting",
    classification: "B_SUPERSEDED",
    proof: "FinanceReportingAggregator never invents money",
    operatorValue: "none",
  },
  {
    id: "P2-PARTNER-BOOKINGS",
    legacySurface: "/partnerBookings",
    capability: "Partner-scoped bookings portal",
    kind: "read",
    dataSource: "order",
    nextReplacement: "INTENTIONALLY_REMOVED from Admin SoT",
    classification: "E_NOT_CURRENT_PRODUCT",
    proof: "PARTNER_BOOKINGS_PORTAL / role portal",
    operatorValue: "none",
  },
  {
    id: "P2-FCM-DIRECT",
    legacySurface: "notification token send",
    capability: "Direct client FCM token targeting",
    kind: "write",
    dataSource: "tokens",
    nextReplacement: "Server audience resolver + Fake push",
    classification: "B_SUPERSEDED",
    proof: "assertNoClientFcmTokens / FakePushDeliveryAdapter",
    operatorValue: "none",
  },
  {
    id: "P2-BROAD-CLAIMS",
    legacySurface: "createPanelUser broad claims",
    capability: "Broad admin custom claims",
    kind: "write",
    dataSource: "Auth claims",
    nextReplacement: "RBAC + identity persona + syncUserClaimsOnWrite",
    classification: "B_SUPERSEDED",
    proof: "IdentityAdminIamContract",
    operatorValue: "none",
  },
  {
    id: "P2-QA-FIXTURE",
    legacySurface: "driverReviewFixture / copies / perf",
    capability: "QA fixtures, copy pages, perf benches",
    kind: "ux",
    dataSource: "n/a",
    nextReplacement: "—",
    classification: "C_OBSOLETE",
    proof: "Non-product Legacy routes",
    operatorValue: "none",
  },
  {
    id: "P2-GEMINI",
    legacySurface: "Gemini helper",
    capability: "AI text generation in Admin",
    kind: "action",
    dataSource: "n/a",
    nextReplacement: "—",
    classification: "C_OBSOLETE",
    proof: "INTENTIONALLY_REMOVED",
    operatorValue: "none",
  },
  {
    id: "P2-CHANNELS-PROFITS",
    legacySurface: "AdminFinanceChannels / Profits",
    capability: "Uneven Legacy satellite finance hubs",
    kind: "report",
    dataSource: "financial_*",
    nextReplacement: "FR7 dashboard/reconciliation/export",
    classification: "B_SUPERSEDED",
    proof: "Uneven Legacy maturity; FR7 covers operator reporting",
    operatorValue: "low",
  },
  {
    id: "P2-RECEIVABLES-PAGE",
    legacySurface: "/adminFinanceReceivables",
    capability: "Dedicated receivables page",
    kind: "report",
    dataSource: "financial_settlements",
    nextReplacement: "FR7 receivables money cell on finance dashboard",
    classification: "B_SUPERSEDED",
    proof: "FinanceReportingAggregator.receivables",
    operatorValue: "low",
  },
  {
    id: "P2-WALLET-TOOL",
    legacySurface: "/adminDriverWallets",
    capability: "adminAdjustDriverWallet tool",
    kind: "write",
    dataSource: "wallets",
    nextReplacement: "Settlements V2 payments / FR5 (gated)",
    classification: "D_UNSAFE_LEGACY",
    proof: "Bypasses settlement SoD; keep out of Admin Next",
    operatorValue: "none",
  },
  {
    id: "P2-TRIP-MUTATE",
    legacySurface: "booking manual status patch",
    capability: "Manual trip lifecycle mutation",
    kind: "write",
    dataSource: "order",
    nextReplacement: "Trip RO only by product contract",
    classification: "D_UNSAFE_LEGACY",
    proof: "Unsafe without domain SM; not current Admin write surface",
    operatorValue: "none",
  },
  {
    id: "P2-OVERRIDE-APPROVE",
    legacySurface: "driver override approve",
    capability: "Override approve without document gates",
    kind: "write",
    dataSource: "user",
    nextReplacement: "approve/reject/needs_changes/suspend SM only",
    classification: "D_UNSAFE_LEGACY",
    proof: "Would falsify driver-owned verification facts",
    operatorValue: "none",
  },
  {
    id: "P2-SETTINGS",
    legacySurface: "/settings",
    capability: "Settings secrets page",
    kind: "read",
    dataSource: "n/a",
    nextReplacement: "/settings NOT_APPLICABLE stub",
    classification: "E_NOT_CURRENT_PRODUCT",
    proof: "FinalProductSurfaceContract",
    operatorValue: "none",
  },
  {
    id: "P2-COMPANY-DRIVERS",
    legacySurface: "/companyDrivers",
    capability: "Company-driver role portal",
    kind: "read",
    dataSource: "user",
    nextReplacement: "Fleet + Drivers Admin surfaces",
    classification: "E_NOT_CURRENT_PRODUCT",
    proof: "Role-gated portal, not Admin SoT",
    operatorValue: "none",
  },
  {
    id: "P2-COPY-ROUTES",
    legacySurface: "admin_*_copy",
    capability: "Duplicate copy list pages",
    kind: "ux",
    dataSource: "n/a",
    nextReplacement: "Canonical list pages",
    classification: "F_DUPLICATE",
    proof: "Legacy copy widgets",
    operatorValue: "none",
  },
  {
    id: "P2-DIAGNOSTICS",
    legacySurface: "/adminDiagnostics",
    capability: "Legacy diagnostics bench",
    kind: "ux",
    dataSource: "n/a",
    nextReplacement: "/admin-next-health/mapping",
    classification: "B_SUPERSEDED",
    proof: "Different tooling; health mapping supersedes",
    operatorValue: "low",
  },
  {
    id: "P2-SCHED-NOTIF",
    legacySurface: "scheduled notifications",
    capability: "Scheduled broadcast campaigns",
    kind: "write",
    dataSource: "n/a",
    nextReplacement: "Compose Fake push only (no schedule)",
    classification: "C_OBSOLETE",
    proof: "No evidence of live scheduled Admin campaigns",
    operatorValue: "none",
  },
] as const;

export function p2GapsByClass(c: P2GapClass): P2GapRow[] {
  return P2_GAP_CLASSIFICATION.filter((g) => g.classification === c);
}

export function p2ImplementableGaps(): P2GapRow[] {
  return p2GapsByClass("A_SHOULD_IMPLEMENT");
}

/** Loaded-page filter helpers (honest bounded search). */
export function filterByNeedle<T>(
  items: readonly T[],
  needle: string,
  fields: (item: T) => Array<string | null | undefined>,
): T[] {
  const q = needle.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) =>
    fields(item).some((f) => (f ?? "").toLowerCase().includes(q)),
  );
}

export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): { pageItems: T[]; totalPages: number; page: number } {
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * size;
  return {
    pageItems: items.slice(start, start + size),
    totalPages,
    page: safePage,
  };
}

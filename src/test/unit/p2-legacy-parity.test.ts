/**
 * P2 legacy business parity — classification + operator UX helpers.
 */

import { describe, expect, it } from "vitest";
import {
  P2_GAP_CLASSIFICATION,
  filterByNeedle,
  paginateSlice,
  p2GapsByClass,
  p2ImplementableGaps,
} from "@/domain/parity/P2GapClassification";
import {
  DEFAULT_P1_WRITE_FLAGS_FALSE,
  allP1WriteFlagsDisabled,
} from "@/application/controlled-writes/P1WriteGates";
import { SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import { PRODUCTION_NAV_HREFS } from "@/domain/ui/navPolicy";
import { DELETE_ARCHIVE_MAPPING } from "@/domain/archive/DeleteArchiveMapping";
import { LEGACY_FINANCE_PDF_STATUS } from "@/domain/reports/SettlementPrintReport";
import { PARTNER_BOOKINGS_PORTAL } from "@/domain/product-contract/P1DomainDepth";
import { identityAdminIamExternalStepPending } from "@/application/identity/IdentityAdminIamContract";
import { executeStorageControlledAction } from "@/domain/storage/StorageControlledWorkflows";
import { createIdempotencyKey } from "@/lib/ids";

describe("P2 gap classification", () => {
  it("classifies remaining gaps and only A are implementable", () => {
    expect(P2_GAP_CLASSIFICATION.length).toBeGreaterThanOrEqual(20);
    const a = p2ImplementableGaps();
    expect(a.every((g) => g.classification === "A_SHOULD_IMPLEMENT")).toBe(
      true,
    );
    expect(a.map((g) => g.id)).toEqual(
      expect.arrayContaining([
        "P2-SUP-FILTER",
        "P2-NOTIF-UNREAD",
        "P2-DRV-DOC-PREVIEW",
        "P2-TRIP-CITY",
        "P2-DRV-CITY",
        "P2-VEH-FILTER",
        "P2-CUST-UX",
        "P2-GEO-REGION-ID",
        "P2-SUP-LINKS",
      ]),
    );
    expect(p2GapsByClass("B_SUPERSEDED").length).toBeGreaterThan(0);
    expect(p2GapsByClass("D_UNSAFE_LEGACY").map((g) => g.id)).toEqual(
      expect.arrayContaining([
        "P2-WALLET-TOOL",
        "P2-TRIP-MUTATE",
        "P2-OVERRIDE-APPROVE",
      ]),
    );
    expect(p2GapsByClass("E_NOT_CURRENT_PRODUCT").map((g) => g.id)).toEqual(
      expect.arrayContaining(["P2-PARTNER-BOOKINGS", "P2-SETTINGS"]),
    );
  });

  it("proves key SUPERSEDED replacements", () => {
    expect(
      DELETE_ARCHIVE_MAPPING.some(
        (r) => r.nextEffect === "intentionally_removed_unsafe_delete",
      ),
    ).toBe(true);
    expect(LEGACY_FINANCE_PDF_STATUS.classification).toBe(
      "INTENTIONALLY_SUPERSEDED",
    );
    expect(PARTNER_BOOKINGS_PORTAL.status).toBe("INTENTIONALLY_REMOVED");
  });

  it("keeps all write gates FALSE and identity IAM external pending", () => {
    expect(allP1WriteFlagsDisabled(DEFAULT_P1_WRITE_FLAGS_FALSE)).toBe(true);
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("SUPPORT_WRITE_ENABLED");
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("ADMIN_IDENTITY_WRITE_ENABLED");
    expect(identityAdminIamExternalStepPending()).toBe(true);
  });

  it("nav includes P0/P1 product surfaces", () => {
    expect(PRODUCTION_NAV_HREFS).toEqual(
      expect.arrayContaining([
        "/support",
        "/notifications",
        "/vehicle-catalog",
        "/partners",
        "/fleet",
        "/guides",
        "/geography",
      ]),
    );
  });
});

describe("P2 list filter helpers", () => {
  it("filters by needle across fields without inventing matches", () => {
    const items = [
      { id: "1", subject: "Payment issue", status: "open" },
      { id: "2", subject: "Driver late", status: "closed" },
    ];
    expect(
      filterByNeedle(items, "pay", (i) => [i.subject, i.status]).map((i) => i.id),
    ).toEqual(["1"]);
    expect(filterByNeedle(items, "  ", (i) => [i.subject])).toHaveLength(2);
  });

  it("paginates slices safely", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const p1 = paginateSlice(items, 1, 20);
    expect(p1.pageItems).toHaveLength(20);
    expect(p1.totalPages).toBe(3);
    const p3 = paginateSlice(items, 99, 20);
    expect(p3.page).toBe(3);
    expect(p3.pageItems).toHaveLength(5);
  });
});

describe("P2 driver document preview workflow", () => {
  it("issues Fake signed preview URL offline", () => {
    const result = executeStorageControlledAction(
      {
        actorUid: "admin1",
        action: "issue_preview_url",
        kind: "driver_document",
        ownerId: "drv1",
        slotOrIndex: "license",
        idempotencyKey: createIdempotencyKey("p2-preview"),
        correlationId: "corr-p2",
      },
      { allowOfflineExecution: true },
    );
    expect(result.ok).toBe(true);
    expect(result.previewUrl).toContain("storage.fake.local");
    expect(result.realUploadPerformed).toBe(false);
  });
});

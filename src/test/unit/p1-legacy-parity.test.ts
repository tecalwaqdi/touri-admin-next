/**
 * P1 legacy business parity — support/notif writes, settlement SM,
 * identity IAM contract, storage, periods, export/print, domain depth.
 */

import { describe, expect, it } from "vitest";
import {
  executeSupportControlledWrite,
} from "@/application/controlled-writes/support/SupportControlledWriteService";
import { FakeSupportWriteRepository } from "@/application/controlled-writes/support/SupportWriteRepository";
import {
  DEFAULT_SUPPORT_WRITE_FLAGS_FALSE,
  assertSupportProductionWriteEnabled,
} from "@/application/controlled-writes/support/SupportWriteFlags";
import {
  assertSupportStatusTransition,
  canTransitionSupportStatus,
} from "@/application/controlled-writes/support/SupportStateMachine";
import {
  executeNotificationControlledWrite,
  FakeAudienceResolver,
  FakeNotificationWriteRepository,
} from "@/application/controlled-writes/notifications/NotificationControlledWriteService";
import {
  DEFAULT_NOTIFICATION_WRITE_FLAGS_FALSE,
  assertNotificationProductionWriteEnabled,
} from "@/application/controlled-writes/notifications/NotificationWriteFlags";
import {
  assertNoClientFcmTokens,
  FakePushDeliveryAdapter,
} from "@/application/controlled-writes/notifications/PushDeliveryAdapter";
import {
  DUAL_SETTLEMENT_SM_BLOCKER_CLEARED,
  SETTLEMENT_STATE_COMPATIBILITY,
  assertProductionUsesSettlementV2,
  mapLegacyOrSyntheticStatusToV2,
} from "@/domain/settlement/compatibility/SettlementStateCompatibility";
import { canTransitionSettlementV2 } from "@/domain/settlement/v2/SettlementV2StateMachine";
import { settlementStateMachine } from "@/domain/settlement/SettlementStateMachine";
import {
  IDENTITY_ADMIN_IAM_CONTRACT,
  identityAdminIamExternalStepPending,
} from "@/application/identity/IdentityAdminIamContract";
import {
  executeStorageControlledAction,
  buildCanonicalStoragePath,
} from "@/domain/storage/StorageControlledWorkflows";
import {
  DELETE_ARCHIVE_MAPPING,
  uiLabelForArchiveEffect,
} from "@/domain/archive/DeleteArchiveMapping";
import {
  LEGACY_FINANCE_PDF_STATUS,
  renderSettlementPrintHtml,
} from "@/domain/reports/SettlementPrintReport";
import {
  SETTLEMENT_EXPORT_COLUMNS,
  assertNoRawInternalExportKeys,
  localizedExportHeaders,
} from "@/domain/reports/ExportLocalization";
import {
  normalizeRegionCascade,
  recordMatchesRegionFilter,
  regionFilterClause,
} from "@/domain/geography/region-integration/RegionCascade";
import {
  mapVehicleCatalogP1Fields,
  mapPartnerP1Fields,
  mapFleetP1Fields,
  mapGuideP1Fields,
  PARTNER_BOOKINGS_PORTAL,
} from "@/domain/product-contract/P1DomainDepth";
import {
  DEFAULT_P1_WRITE_FLAGS_FALSE,
  P1_WRITE_INVENTORY,
  allP1WriteFlagsDisabled,
} from "@/application/controlled-writes/P1WriteGates";
import {
  executeDriverCreate,
  buildDriverDocExpiryQueue,
} from "@/application/controlled-writes/drivers-create/DriverCreateService";
import {
  canApplyPeriodAction,
  executeFinancialPeriodWrite,
  mapFinancialPeriodDoc,
} from "@/application/finance/periods/FinancialPeriodService";
import { SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import { IDENTITY_WRITE_PRODUCTION_HARD_FALSE } from "@/application/controlled-writes/identity/IdentityWriteFlags";

function memoryIdempotency<T>() {
  const m = new Map<string, T>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: T) => {
      m.set(k, v);
    },
  };
}

const superActor = {
  uid: "admin1",
  role: "super_admin" as const,
  permissions: [
    "customers:manage" as const,
    "users:manage" as const,
    "drivers:approve" as const,
  ],
  scope: { type: "global" as const },
};

describe("P1 support writes", () => {
  it("gates Production OFF by default and hard-denies", () => {
    expect(DEFAULT_SUPPORT_WRITE_FLAGS_FALSE.SUPPORT_WRITE_ENABLED).toBe(false);
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("SUPPORT_WRITE_ENABLED");
    expect(() =>
      assertSupportProductionWriteEnabled({
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        SUPPORT_WRITE_ENABLED: true,
      }),
    ).toThrow(/hard-disabled|WRITE_DISABLED/);
  });

  it("applies status lifecycle offline with audit/idempotency", async () => {
    const repo = new FakeSupportWriteRepository();
    repo.seed("t1", { halh: "Open", status: "open" }, "tok1");
    const idem = memoryIdempotency<Awaited<ReturnType<typeof executeSupportControlledWrite>>>();
    const deps = {
      flags: DEFAULT_SUPPORT_WRITE_FLAGS_FALSE,
      loadPort: {
        async load(id: string) {
          const d = repo.docs.get(id);
          if (!d) return null;
          return {
            exists: true,
            ticketId: id,
            status: "open" as const,
            displayStatus: "open" as const,
            countryId: "saudi_arabia",
            assignedAdminId: null,
            category: null,
            priority: null,
            isDriverSchema: false,
            preconditionToken: d.token,
          };
        },
      },
      repository: repo,
      idempotency: idem,
      audit: {
        recordIntent: async () => ({ intentId: "i1" }),
        recordResult: async () => ({ resultId: "r1" }),
      },
      allowOfflineExecution: true,
    };

    const first = await executeSupportControlledWrite(
      {
        actor: superActor,
        ticketId: "t1",
        action: "change_status",
        targetStatus: "in_progress",
        expectedPreconditionToken: "tok1",
        idempotencyKey: "idem-s1",
        correlationId: "c1",
      },
      deps,
    );
    expect(first.ok).toBe(true);
    expect(first.productionWriteExecuted).toBe(false);

    const replay = await executeSupportControlledWrite(
      {
        actor: superActor,
        ticketId: "t1",
        action: "change_status",
        targetStatus: "in_progress",
        expectedPreconditionToken: repo.docs.get("t1")!.token,
        idempotencyKey: "idem-s1",
        correlationId: "c1",
      },
      deps,
    );
    expect(replay.status).toBe("idempotent_replay");

    expect(canTransitionSupportStatus("open", "resolved")).toBe(true);
    expect(() => assertSupportStatusTransition("closed", "waiting_user")).toThrow();
  });

  it("denies country-scoped actor out of scope", async () => {
    const repo = new FakeSupportWriteRepository();
    repo.seed("t2", {}, "tok2");
    const result = await executeSupportControlledWrite(
      {
        actor: {
          ...superActor,
          scope: { type: "country", countryIds: ["egypt"] },
        },
        ticketId: "t2",
        action: "resolve",
        expectedPreconditionToken: "tok2",
        idempotencyKey: "idem-scope",
        correlationId: "c2",
      },
      {
        flags: DEFAULT_SUPPORT_WRITE_FLAGS_FALSE,
        loadPort: {
          async load() {
            return {
              exists: true,
              ticketId: "t2",
              status: "open",
              displayStatus: "open",
              countryId: "saudi_arabia",
              assignedAdminId: null,
              category: null,
              priority: null,
              isDriverSchema: false,
              preconditionToken: "tok2",
            };
          },
        },
        repository: repo,
        idempotency: memoryIdempotency(),
        audit: {
          recordIntent: async () => ({ intentId: "i" }),
          recordResult: async () => ({ resultId: "r" }),
        },
        allowOfflineExecution: true,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SCOPE_DENIED");
  });
});

describe("P1 notification writes", () => {
  it("gates OFF and rejects client FCM tokens", () => {
    expect(DEFAULT_NOTIFICATION_WRITE_FLAGS_FALSE.NOTIFICATION_WRITE_ENABLED).toBe(
      false,
    );
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("NOTIFICATION_WRITE_ENABLED");
    expect(() =>
      assertNotificationProductionWriteEnabled({
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        NOTIFICATION_WRITE_ENABLED: true,
      }),
    ).toThrow();
    expect(() => assertNoClientFcmTokens({ fcmToken: "x" })).toThrow(
      /FCM/,
    );
  });

  it("mark_read + compose_send via Fake — no real push", async () => {
    const repo = new FakeNotificationWriteRepository();
    const push = new FakePushDeliveryAdapter();
    const recent = new Set<string>();
    const deps = {
      flags: DEFAULT_NOTIFICATION_WRITE_FLAGS_FALSE,
      repository: repo,
      audienceResolver: new FakeAudienceResolver(),
      pushAdapter: push,
      idempotency: memoryIdempotency<
        Awaited<ReturnType<typeof executeNotificationControlledWrite>>
      >(),
      audit: {
        recordIntent: async () => ({ intentId: "ni" }),
        recordResult: async () => ({ resultId: "nr" }),
      },
      recentSendKeys: recent,
      allowOfflineExecution: true,
    };

    const marked = await executeNotificationControlledWrite(
      {
        actor: superActor,
        action: "mark_read",
        notificationId: "n1",
        idempotencyKey: "n-idem-1",
        correlationId: "nc1",
      },
      deps,
    );
    expect(marked.ok).toBe(true);
    expect(marked.realPushSent).toBe(false);

    const sent = await executeNotificationControlledWrite(
      {
        actor: superActor,
        action: "compose_send",
        idempotencyKey: "n-idem-2",
        correlationId: "nc2",
        compose: {
          title: "Hello",
          body: "World",
          audience: { kind: "admin_panel" },
        },
      },
      deps,
    );
    expect(sent.ok).toBe(true);
    expect(sent.realPushSent).toBe(false);
    expect(push.calls.length).toBe(1);

    const dup = await executeNotificationControlledWrite(
      {
        actor: superActor,
        action: "compose_send",
        idempotencyKey: "n-idem-3",
        correlationId: "nc3",
        compose: {
          title: "Hello",
          body: "World",
          audience: { kind: "admin_panel" },
        },
      },
      deps,
    );
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe("DUPLICATE_SEND");
  });
});

describe("P1 settlement SM alignment", () => {
  it("clears dual-SM blocker; V2 is Production write SoT", () => {
    expect(DUAL_SETTLEMENT_SM_BLOCKER_CLEARED).toBe(true);
    expect(SETTLEMENT_STATE_COMPATIBILITY.authoritative).toBe(
      "settlement_v2_fr1_fr7",
    );
    expect(SETTLEMENT_STATE_COMPATIBILITY.productionWriteModel).toBe(
      "settlement_v2",
    );
    expect(() =>
      assertProductionUsesSettlementV2({ writeModel: "synthetic_legacy" }),
    ).toThrow(/REQUIRES_V2/);
    assertProductionUsesSettlementV2({ writeModel: "settlement_v2" });

    expect(mapLegacyOrSyntheticStatusToV2("approved")).toBe("locked");
    expect(mapLegacyOrSyntheticStatusToV2("closed")).toBe("settled");
    expect(canTransitionSettlementV2("draft", "locked")).toBe(true);
    expect(canTransitionSettlementV2("settled", "draft")).toBe(false);

    // Offline synthetic SM still legal for unit SettlementService
    expect(settlementStateMachine.canTransition("draft", "under_review")).toBe(
      true,
    );
  });
});

describe("P1 identity admin architecture", () => {
  it("app code complete; IAM external pending; no SA JSON; shadow-reader RO", () => {
    expect(IDENTITY_ADMIN_IAM_CONTRACT.appCodeComplete).toBe(true);
    expect(IDENTITY_ADMIN_IAM_CONTRACT.iamGrantedThisPhase).toBe(false);
    expect(IDENTITY_ADMIN_IAM_CONTRACT.shadowReaderRemainsReadOnly).toBe(true);
    expect(IDENTITY_ADMIN_IAM_CONTRACT.saJsonForbidden).toBe(true);
    expect(identityAdminIamExternalStepPending()).toBe(true);
    expect(IDENTITY_WRITE_PRODUCTION_HARD_FALSE).toBe(false);
    expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain("ADMIN_IDENTITY_WRITE_ENABLED");
  });
});

describe("P1 storage / landmark images", () => {
  it("builds canonical paths; rejects arbitrary client paths; Fake only", () => {
    expect(
      buildCanonicalStoragePath({
        kind: "driver_document",
        ownerId: "d1",
        slotOrIndex: "license",
      }),
    ).toBe("drivers/d1/documents/license");
    const denied = executeStorageControlledAction({
      actorUid: "a",
      action: "replace_landmark_image",
      kind: "landmark_image",
      ownerId: "m1",
      slotOrIndex: "0",
      mimeType: "image/png",
      sizeBytes: 100,
      idempotencyKey: "s1",
      correlationId: "c",
      clientStoragePath: "gs://evil/path",
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("ARBITRARY_STORAGE_PATH_FORBIDDEN");

    const preview = executeStorageControlledAction(
      {
        actorUid: "a",
        action: "issue_preview_url",
        kind: "driver_document",
        ownerId: "d1",
        slotOrIndex: "national_id",
        idempotencyKey: "s2",
        correlationId: "c",
      },
      { allowOfflineExecution: true },
    );
    expect(preview.ok).toBe(true);
    expect(preview.realUploadPerformed).toBe(false);
    expect(preview.previewUrl).toContain("storage.fake.local");
  });
});

describe("P1 PDF / export / archive / region / depth", () => {
  it("marks Legacy finance PDF INTENTIONALLY_SUPERSEDED; printable receipt works", () => {
    expect(LEGACY_FINANCE_PDF_STATUS.classification).toBe(
      "INTENTIONALLY_SUPERSEDED",
    );
    const html = renderSettlementPrintHtml(
      {
        settlementId: "s1",
        status: "locked",
        currency: "SAR",
        totalMinor: "1000",
        outstandingMinor: "200",
        partyLabel: "agent:a1",
        countryId: "saudi_arabia",
        generatedAtUtc: "2026-09-16T00:00:00.000Z",
        actorUid: "admin1",
        payments: [
          {
            id: "p1",
            amountMinor: "800",
            method: "bank",
            state: "confirmed",
            reference: "REF",
            createdBy: "u1",
            confirmedBy: "u2",
            createdAtUtc: "2026-09-16T00:00:00.000Z",
          },
        ],
      },
      "ar",
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("إيصال تسوية");
    expect(html).toContain("800");
  });

  it("localizes export headers without raw Legacy keys", () => {
    const headers = localizedExportHeaders(SETTLEMENT_EXPORT_COLUMNS, "ar");
    expect(headers[0]).toBe("معرّف التسوية");
    assertNoRawInternalExportKeys(headers);
  });

  it("maps delete→archive labels", () => {
    expect(DELETE_ARCHIVE_MAPPING.length).toBeGreaterThan(5);
    expect(uiLabelForArchiveEffect("landmark", "en")).toBe("Archive");
    expect(uiLabelForArchiveEffect("support", "ar")).toBe("إغلاق");
  });

  it("region cascade does not force null regions", () => {
    expect(normalizeRegionCascade({ countryId: null, regionId: "r1" })).toEqual(
      { countryId: null, regionId: null, cityId: null },
    );
    const filter = regionFilterClause({ regionId: "r1" });
    expect(recordMatchesRegionFilter(null, filter)).toBe(false);
    expect(recordMatchesRegionFilter("r1", filter)).toBe(true);
  });

  it("maps P1 domain depth fields; partner bookings remain removed", () => {
    expect(mapVehicleCatalogP1Fields({ passengers: 4, make: "Toyota" }).passengers).toBe(
      4,
    );
    expect(mapPartnerP1Fields({ isShrek: true, partnerKind: "hotel" }).partnerKind).toBe(
      "hotel",
    );
    expect(mapFleetP1Fields({ license_number: "L1" }).licenseNumber).toBe("L1");
    expect(mapGuideP1Fields({ tour_guide_status: "approved" }).status).toBe(
      "approved",
    );
    expect(PARTNER_BOOKINGS_PORTAL.status).toBe("INTENTIONALLY_REMOVED");
  });
});

describe("P1 driver create / periods / write inventory", () => {
  it("driver create gated OFF; Fake offline works; expiry queue sorts", () => {
    const denied = executeDriverCreate({
      actorUid: "a",
      displayName: "D",
      phoneE164: "+9665",
      countryId: "saudi_arabia",
      idempotencyKey: "d1",
      correlationId: "c",
    });
    expect(denied.code).toBe("PRODUCTION_WRITE_DISABLED");

    const ok = executeDriverCreate(
      {
        actorUid: "a",
        displayName: "D",
        phoneE164: "+9665",
        countryId: "saudi_arabia",
        idempotencyKey: "d1",
        correlationId: "c",
      },
      { allowOfflineExecution: true },
    );
    expect(ok.ok).toBe(true);
    expect(ok.productionWriteExecuted).toBe(false);

    const queue = buildDriverDocExpiryQueue(
      [
        {
          driverId: "d1",
          slot: "license",
          expiresAtUtc: new Date(Date.now() + 2 * 86400000).toISOString(),
        },
        {
          driverId: "d2",
          slot: "national_id",
          expiresAtUtc: new Date(Date.now() + 40 * 86400000).toISOString(),
        },
      ],
      Date.now(),
    );
    expect(queue).toHaveLength(1);
    expect(queue[0]!.driverId).toBe("d1");
  });

  it("financial periods transitions + gate", () => {
    expect(canApplyPeriodAction("open", "close")).toBe(true);
    expect(canApplyPeriodAction("locked", "open")).toBe(false);
    const denied = executeFinancialPeriodWrite(
      {
        actorUid: "a",
        periodId: "p1",
        action: "close",
        idempotencyKey: "k",
        correlationId: "c",
      },
      { status: "open" },
    );
    expect(denied.code).toBe("PRODUCTION_WRITE_DISABLED");
    const mapped = mapFinancialPeriodDoc({
      id: "p1",
      data: { status: "open", currencyCode: "sar", label: "Q1" },
    });
    expect(mapped.status).toBe("open");
    expect(mapped.currencyCode).toBe("SAR");
  });

  it("all P1 write gates default false and inventory gated off", () => {
    expect(allP1WriteFlagsDisabled(DEFAULT_P1_WRITE_FLAGS_FALSE)).toBe(true);
    expect(P1_WRITE_INVENTORY.every((r) => r.productionArmed === false)).toBe(
      true,
    );
    expect(P1_WRITE_INVENTORY.every((r) => r.codeComplete && r.pilotReady)).toBe(
      true,
    );
  });
});

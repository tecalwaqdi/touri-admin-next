import { describe, expect, it } from "vitest";
import {
  assertRegistrationAllowsDocumentReview,
  legalDocumentReviewActions,
  normalizeDocumentSlotReviewStatus,
  toCfDocumentReviewAction,
  toCfDocumentType,
} from "@/domain/driver/DriverDocumentReview";
import {
  canonicalDriverDocumentReviewSchema,
  executeCanonicalDriverDocumentReview,
  CanonicalDriverDocumentReviewError,
} from "@/application/drivers/CanonicalDriverDocumentReview";
import type { AuthUser } from "@/types/auth";

describe("DriverDocumentReview domain", () => {
  it("maps needs_changes to CF request_replacement", () => {
    expect(toCfDocumentReviewAction("needs_changes")).toBe("request_replacement");
    expect(toCfDocumentReviewAction("approve")).toBe("approve");
  });

  it("normalizes needs_replacement to needs_changes", () => {
    expect(normalizeDocumentSlotReviewStatus("needs_replacement")).toBe(
      "needs_changes",
    );
    expect(normalizeDocumentSlotReviewStatus("needs_reupload")).toBe(
      "needs_changes",
    );
  });

  it("blocks draft registration from review", () => {
    expect(() =>
      assertRegistrationAllowsDocumentReview({ registrationStatus: "draft" }),
    ).toThrow();
    expect(() =>
      assertRegistrationAllowsDocumentReview({
        registrationStatus: "pending_review",
      }),
    ).not.toThrow();
  });

  it("exposes CF types for core slots and null for photos", () => {
    expect(toCfDocumentType("national_id")).toBe("national_id");
    expect(toCfDocumentType("profile_photo")).toBeNull();
    expect(toCfDocumentType("vehicle_photo")).toBeNull();
  });

  it("requires present document for legal actions", () => {
    expect(
      legalDocumentReviewActions({
        presence: "missing",
        reviewStatus: "pending_review",
        registrationStatus: "pending_review",
      }),
    ).toEqual([]);
    expect(
      legalDocumentReviewActions({
        presence: "present",
        reviewStatus: "pending_review",
        registrationStatus: "pending_review",
      }),
    ).toEqual(["approve", "reject", "needs_changes"]);
  });
});

describe("CanonicalDriverDocumentReview application", () => {
  const actor: AuthUser = {
    id: "admin-super-1",
    email: "a@b.c",
    displayName: "Admin",
    role: "super_admin",
    permissions: ["drivers:approve", "drivers:read", "agents:read"],
    scope: { type: "global" },
    status: "active",
    locale: "en",
  };

  it("rejects invalid payload", async () => {
    await expect(
      executeCanonicalDriverDocumentReview(
        actor,
        { action: "approve" },
        {
          assertEnabled: () => undefined,
          loadTarget: async () => null,
          repository: {
            reserve: async () => "k",
            review: async () => {
              throw new Error("unreachable");
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(CanonicalDriverDocumentReviewError);
  });

  it("blocks draft via loadTarget registration", async () => {
    const parsed = canonicalDriverDocumentReviewSchema.parse({
      action: "approve",
      driverId: "driverABCDEF",
      slot: "national_id",
      expectedDocumentVersion: 1,
      reason: "",
      idempotencyKey: "idempotencykey12",
    });
    await expect(
      executeCanonicalDriverDocumentReview(actor, parsed, {
        assertEnabled: () => undefined,
        loadTarget: async () => ({
          operationalDriver: true,
          countryId: "kyrgyzstan",
          cityId: "bishkek",
          agentId: null,
          registrationStatus: "draft",
          submissionStatus: "draft",
          slotPresence: "present",
          documentVersion: 1,
          slotField: "doc_national_id",
        }),
        repository: {
          reserve: async () => "k",
          review: async () => {
            throw new Error("unreachable");
          },
        },
      }),
    ).rejects.toMatchObject({ code: "DRIVER_NOT_READY" });
  });

  it("enforces stale documentVersion", async () => {
    await expect(
      executeCanonicalDriverDocumentReview(
        actor,
        {
          action: "approve",
          driverId: "driverABCDEF",
          slot: "national_id",
          expectedDocumentVersion: 1,
          reason: "",
          idempotencyKey: "idempotencykey12",
        },
        {
          assertEnabled: () => undefined,
          loadTarget: async () => ({
            operationalDriver: true,
            countryId: "kyrgyzstan",
            cityId: "bishkek",
            agentId: null,
            registrationStatus: "pending_review",
            submissionStatus: "submitted",
            slotPresence: "present",
            documentVersion: 2,
            slotField: "doc_national_id",
          }),
          repository: {
            reserve: async () => "k",
            review: async () => {
              throw new Error("unreachable");
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("applies review when preconditions hold", async () => {
    const receipt = await executeCanonicalDriverDocumentReview(
      actor,
      {
        action: "needs_changes",
        driverId: "driverABCDEF",
        slot: "national_id",
        expectedDocumentVersion: 1,
        reason: "blurry scan",
        idempotencyKey: "idempotencykey12",
      },
      {
        assertEnabled: () => undefined,
        loadTarget: async () => ({
          operationalDriver: true,
          countryId: "kyrgyzstan",
          cityId: "bishkek",
          agentId: null,
          registrationStatus: "pending_review",
          submissionStatus: "submitted",
          slotPresence: "present",
          documentVersion: 1,
          slotField: "doc_national_id",
        }),
        repository: {
          reserve: async () => "wf",
          review: async (command) => ({
            driverId: command.driverId,
            slot: command.slot,
            action: command.action,
            reviewStatus: "needs_changes",
            documentVersion: 1,
            replay: false,
          }),
        },
      },
    );
    expect(receipt.action).toBe("needs_changes");
    expect(receipt.reviewStatus).toBe("needs_changes");
  });
});

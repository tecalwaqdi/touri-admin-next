import { beforeEach, describe, expect, it } from "vitest";
import { getRepositories, resetRepositoriesForTests } from "@/repositories/container";
import { getSettlementService } from "@/application/services";
import { seedUsers } from "@/test/fixtures/seed";

describe("settlement commands", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
  });

  it("prevents self-approval", async () => {
    const superUser = seedUsers.find((u) => u.id === "user_super")!;
    const service = getSettlementService();
    const draft = await service.createDraft(superUser, {
      partyType: "agent",
      partyId: "AGT-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      countryId: "SA",
      idempotencyKey: "idem_self_approve_test",
    });
    const submitted = await service.submit(superUser, draft.id);
    await expect(service.approve(superUser, submitted.id)).rejects.toMatchObject({
      code: "SELF_APPROVAL_FORBIDDEN",
    });
  });

  it("prevents duplicate trip in two closed settlements", async () => {
    const accountant = seedUsers.find((u) => u.id === "user_accountant")!;
    const approver = seedUsers.find((u) => u.id === "user_finance_approver")!;
    const service = getSettlementService();
    const preview = await service.previewEligibility({
      partyType: "agent",
      partyId: "AGT-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      countryId: "SA",
    });
    const tripId = preview.eligible[0]?.tripId;
    expect(tripId).toBeTruthy();

    const first = await service.createDraft(accountant, {
      partyType: "agent",
      partyId: "AGT-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      countryId: "SA",
      tripIds: [tripId!],
      idempotencyKey: "idem_dup_1",
    });
    await service.submit(accountant, first.id);
    await service.approve(approver, first.id);
    await service.close(approver, first.id);

    const closed = await getRepositories().settlements.findClosedContainingTrip(tripId!);
    expect(closed?.id).toBe(first.id);

    await expect(
      service.createDraft(accountant, {
        partyType: "agent",
        partyId: "AGT-SA-001",
        currencyCode: "SAR",
        periodFromUtc: "2026-08-01T00:00:00.000Z",
        periodToUtc: "2026-08-31T23:59:59.000Z",
        countryId: "SA",
        tripIds: [tripId!],
        idempotencyKey: "idem_dup_2",
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SETTLEMENT_TRIP" });
  });

  it("reverses closed settlements via reverseSettlement path", async () => {
    const accountant = seedUsers.find((u) => u.id === "user_accountant")!;
    const approver = seedUsers.find((u) => u.id === "user_finance_approver")!;
    const service = getSettlementService();
    const preview = await service.previewEligibility({
      partyType: "driver",
      partyId: "DRV-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      countryId: "SA",
    });
    const tripIds = preview.eligible.slice(0, 1).map((e) => e.tripId);
    expect(tripIds.length).toBe(1);
    const draft = await service.createDraft(accountant, {
      partyType: "driver",
      partyId: "DRV-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      countryId: "SA",
      tripIds,
      idempotencyKey: "idem_reverse_1",
    });
    await service.submit(accountant, draft.id);
    await service.approve(approver, draft.id);
    await service.close(approver, draft.id);
    const reversed = await service.reverse(approver, draft.id, "correction");
    expect(reversed.status).toBe("reversed");
  });
});

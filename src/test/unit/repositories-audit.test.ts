import { describe, expect, it } from "vitest";
import { InMemoryTripRepository } from "@/repositories/in-memory/InMemoryTripRepository";
import { DashboardService } from "@/application/dashboard/DashboardService";
import { InMemoryDriverRepository } from "@/repositories/in-memory/InMemoryDriverRepository";
import { InMemoryCustomerRepository } from "@/repositories/in-memory/InMemoryCustomerRepository";
import { AuditService } from "@/audit/AuditService";
import { InMemoryAuditRepository } from "@/repositories/in-memory/InMemoryAuditRepository";
import { createCorrelationId, createIdempotencyKey, createRequestId } from "@/lib/ids";

describe("repositories and audit foundation", () => {
  it("paginates trips via repository", async () => {
    const repo = new InMemoryTripRepository();
    const page1 = await repo.list({ page: 1, pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.totalPages).toBeGreaterThan(1);
  });

  it("builds synthetic dashboard metrics", async () => {
    const service = new DashboardService(
      new InMemoryTripRepository(),
      new InMemoryDriverRepository(),
      new InMemoryCustomerRepository(),
    );
    const metrics = await service.getMetrics();
    expect(metrics.synthetic).toBe(true);
    expect(metrics.totalTrips).toBeGreaterThan(0);
    expect(metrics.cashCollected).toBeNull();
    expect(metrics.financeSource).toBe("fr7_reporting_read_service");
  });

  it("stores audit events with correlation id", async () => {
    const audit = new AuditService(new InMemoryAuditRepository());
    const correlationId = createCorrelationId();
    const event = await audit.record({
      actorUserId: "user_super",
      actorRole: "super_admin",
      action: "login",
      resourceType: "session",
      resourceId: "user_super",
      correlationId,
    });
    expect(event.auditId).toMatch(/^audit_/);
    expect(event.correlationId).toBe(correlationId);
    expect(createRequestId()).toMatch(/^req_/);
    expect(createIdempotencyKey()).toMatch(/^idem_/);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { GET as getSettlements, POST as postSettlement } from "@/app/api/settlements/route";
import { POST as settlementAction } from "@/app/api/settlements/[id]/[action]/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { GET as exportReport } from "@/app/api/reports/export/route";
import { POST as activateAgent } from "@/app/api/agents/activate/route";
import { resetRepositoriesForTests, getRepositories } from "@/repositories/container";
import { seedUsers } from "@/test/fixtures/seed";

function req(
  url: string,
  init: RequestInit & { userId?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  if (init.userId) headers.set("x-user-id", init.userId);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(url, { ...init, headers });
}

describe("settlement and security APIs", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
  });

  it("rejects unauthorized settlement list", async () => {
    const res = await getSettlements(req("http://localhost/api/settlements"));
    expect(res.status).toBe(401);
  });

  it("rejects forbidden approve without permission", async () => {
    const accountant = seedUsers.find((u) => u.id === "user_accountant")!;
    const create = await postSettlement(
      req("http://localhost/api/settlements", {
        method: "POST",
        userId: accountant.id,
        idempotencyKey: "api_create_1",
        body: JSON.stringify({
          partyType: "agent",
          partyId: "AGT-SA-001",
          currencyCode: "SAR",
          periodFromUtc: "2026-08-01T00:00:00.000Z",
          periodToUtc: "2026-08-31T23:59:59.000Z",
          countryId: "SA",
        }),
      }),
    );
    expect(create.status).toBe(201);
    const settlement = (await create.json()) as { id: string };
    await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/submit`, {
        method: "POST",
        userId: accountant.id,
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "submit" }) },
    );
    const ops = seedUsers.find((u) => u.id === "user_ops")!;
    const approve = await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/approve`, {
        method: "POST",
        userId: ops.id,
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "approve" }) },
    );
    expect(approve.status).toBe(403);
  });

  it("rejects self-approve via API and supports dual control + idempotent approve", async () => {
    const creator = seedUsers.find((u) => u.id === "user_super")!;
    const approver = seedUsers.find((u) => u.id === "user_finance_approver")!;
    const create = await postSettlement(
      req("http://localhost/api/settlements", {
        method: "POST",
        userId: creator.id,
        idempotencyKey: "api_create_2",
        body: JSON.stringify({
          partyType: "agent",
          partyId: "AGT-SA-001",
          currencyCode: "SAR",
          periodFromUtc: "2026-08-01T00:00:00.000Z",
          periodToUtc: "2026-08-31T23:59:59.000Z",
          countryId: "SA",
        }),
      }),
    );
    const settlement = (await create.json()) as { id: string };
    await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/submit`, {
        method: "POST",
        userId: creator.id,
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "submit" }) },
    );
    const self = await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/approve`, {
        method: "POST",
        userId: creator.id,
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "approve" }) },
    );
    expect(self.status).toBe(400);
    const body = (await self.json()) as { code: string };
    expect(body.code).toBe("SELF_APPROVAL_FORBIDDEN");
    const first = await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/approve`, {
        method: "POST",
        userId: approver.id,
        idempotencyKey: "approve_once",
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "approve" }) },
    );
    expect(first.status).toBe(200);
    const second = await settlementAction(
      req(`http://localhost/api/settlements/${settlement.id}/approve`, {
        method: "POST",
        userId: approver.id,
        idempotencyKey: "approve_once",
        body: "{}",
      }),
      { params: Promise.resolve({ id: settlement.id, action: "approve" }) },
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("x-correlation-id")).toBeTruthy();
  });

  it("filters audit and rejects CSV export without permission", async () => {
    const auditor = seedUsers.find((u) => u.id === "user_auditor")!;
    const auditRes = await getAudit(
      req("http://localhost/api/audit?action=login&pageSize=10", {
        userId: auditor.id,
      }),
    );
    expect(auditRes.status).toBe(200);
    const agentUser = seedUsers.find((u) => u.id === "user_agent_sa")!;
    const csv = await exportReport(
      req("http://localhost/api/reports/export?type=trip_financial_summary&currencyCode=SAR", {
        userId: agentUser.id,
      }),
    );
    expect(csv.status).toBe(403);
  });

  it("rejects second active agent for same country via API", async () => {
    const superUser = seedUsers.find((u) => u.id === "user_super")!;
    // Ensure inactive historical agent cannot be activated while AGT-SA-001 is active
    // Wait - AGT-SA-000 is inactive; activating it should fail because AGT-SA-001 is active
    const res = await activateAgent(
      req("http://localhost/api/agents/activate", {
        method: "POST",
        userId: superUser.id,
        body: JSON.stringify({
          agentId: "AGT-SA-000",
          countryId: "SA",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("COUNTRY_ALREADY_HAS_ACTIVE_AGENT");
    const events = await getRepositories().audit.list(20);
    expect(
      events.some((e) => e.action === "agent_assignment_attempt_rejected"),
    ).toBe(true);
  });

  it("enforces country scope on settlement read", async () => {
    const saAdmin = seedUsers.find((u) => u.id === "user_sa_admin")!;
    // country_admin has finance:read (F6) but must stay in-country
    const ok = await getSettlements(
      req("http://localhost/api/settlements?countryId=SA", {
        userId: saAdmin.id,
      }),
    );
    expect(ok.status).toBe(200);

    const denied = await getSettlements(
      req("http://localhost/api/settlements?countryId=AE", {
        userId: saAdmin.id,
      }),
    );
    expect(denied.status).toBe(403);
    const json = (await denied.json()) as { code?: string };
    expect(json.code).toBe("SCOPE_DENIED");
  });
});

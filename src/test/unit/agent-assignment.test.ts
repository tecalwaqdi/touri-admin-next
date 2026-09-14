import { describe, expect, it } from "vitest";
import { AgentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import { seedAgents } from "@/test/fixtures/seed";
import type { Agent } from "@/types/agent";

describe("agent one-to-one rule", () => {
  const policy = new AgentAssignmentPolicy();

  it("allows activating an agent when country has no other active agent", () => {
    const decision = policy.canActivateAgent({
      countryId: "SA",
      agentId: "AGT-SA-001",
      agentStatus: "inactive",
      existingAgents: seedAgents,
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects second active agent for same country", () => {
    const decision = policy.canActivateAgent({
      countryId: "SA",
      agentId: "AGT-SA-NEW",
      agentStatus: "inactive",
      existingAgents: seedAgents,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("COUNTRY_ALREADY_HAS_ACTIVE_AGENT");
      expect(decision.existingActiveAgentId).toBe("AGT-SA-001");
    }
  });

  it("validates seed has at most one active agent per country", () => {
    const result = policy.validateSeed(seedAgents);
    expect(result.valid).toBe(true);
  });

  it("detects seed violations", () => {
    const bad: Agent[] = [
      ...seedAgents,
      {
        id: "agent_sa_dup",
        name: "Duplicate",
        countryId: "SA",
        status: "active",
        commissionPlaceholder: "n/a",
        driversCount: 0,
        tripsCount: 0,
        activeFromUtc: null,
        activeToUtc: null,
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
    ];
    const result = policy.validateSeed(bad);
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.countryId).toBe("SA");
  });
});

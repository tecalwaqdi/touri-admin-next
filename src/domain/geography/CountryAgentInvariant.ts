/**
 * ONE COUNTRY = ONE ACTIVE AGENT diagnostics (PC-6, read-only).
 * Never auto-corrects assignments.
 */

import { diagnoseSuspiciousActiveAgent } from "@/domain/geography/GeographyPresentation";
import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";

export type CountryAgentInvariantState =
  | "PASS"
  | "NO_ACTIVE_AGENT"
  | "VIOLATION"
  | "DATA_QUALITY_WARNING";

export type CountryAgentMappingInput = {
  agentId: string;
  agentName?: string | null;
  countryId?: string | null;
  countryBucket?: string | null;
  status: "active" | "inactive" | string;
  authoritativeRole?: string | null;
  isOperationalAgent?: boolean;
  mappingStatus?: string | null;
};

export type CountryAgentInvariantResult = {
  state: CountryAgentInvariantState;
  /** Legacy UI enum compatibility. */
  invariant: "pass" | "fail_multiple_active" | "no_active_agent";
  activeAgentId: string | null;
  activeAgentName: string | null;
  activeAgentCount: number;
  inactiveAgentCount: number;
  issues: GeographyDqIssue[];
};

function isActive(status: string): boolean {
  return status === "active";
}

/**
 * Classify country↔active-agent invariant for one country bucket.
 */
export function diagnoseCountryAgentInvariant(input: {
  countryId: string;
  countryBucket: string;
  agents: readonly CountryAgentMappingInput[];
}): CountryAgentInvariantResult {
  const active = input.agents.filter((a) => isActive(a.status));
  const inactiveAgentCount = input.agents.length - active.length;
  const issues: GeographyDqIssue[] = [];

  // Cross-country mismatch warnings (mapping quality — G).
  for (const agent of input.agents) {
    if (!agent.countryBucket && !agent.countryId) {
      issues.push({
        code: "agent_missing_country",
        severity: "ERROR",
        messageEn: `Agent ${agent.agentId} missing country reference`,
        messageAr: `الوكيل ${agent.agentId} بلا مرجع دولة`,
        entityKind: "agent_mapping",
        entityId: agent.agentId,
      });
      continue;
    }
    const bucket = agent.countryBucket ?? agent.countryId ?? "";
    if (bucket && bucket !== input.countryBucket) {
      issues.push({
        code: "agent_cross_country_mismatch",
        severity: "ERROR",
        messageEn: `Agent ${agent.agentId} country bucket mismatch`,
        messageAr: `عدم تطابق دولة الوكيل ${agent.agentId}`,
        entityKind: "agent_mapping",
        entityId: agent.agentId,
      });
    }
  }

  if (active.length > 1) {
    issues.push({
      code: "duplicate_active_agents",
      severity: "INVARIANT_VIOLATION",
      messageEn: "Duplicate active agents — invariant fail",
      messageAr: "وكلاء نشطون متعددون — فشل القيد",
      entityKind: "country",
      entityId: input.countryId,
    });
    return {
      state: "VIOLATION",
      invariant: "fail_multiple_active",
      activeAgentId: active[0]?.agentId ?? null,
      activeAgentName: active[0]?.agentName ?? active[0]?.agentId ?? null,
      activeAgentCount: active.length,
      inactiveAgentCount,
      issues,
    };
  }

  if (active.length === 0) {
    issues.push({
      code: "no_active_agent",
      severity: "WARNING",
      messageEn: "No active agent for country",
      messageAr: "لا يوجد وكيل نشط لهذه الدولة",
      entityKind: "country",
      entityId: input.countryId,
    });
    return {
      state: "NO_ACTIVE_AGENT",
      invariant: "no_active_agent",
      activeAgentId: null,
      activeAgentName: null,
      activeAgentCount: 0,
      inactiveAgentCount,
      issues,
    };
  }

  const primary = active[0]!;
  const suspicious = diagnoseSuspiciousActiveAgent({
    agentName: primary.agentName,
    authoritativeRole: primary.authoritativeRole,
    isOperationalAgent: primary.isOperationalAgent,
    mappingStatus: primary.mappingStatus,
  });
  if (suspicious) {
    issues.push({
      code: suspicious.code,
      severity: "WARNING",
      messageEn: suspicious.messageEn,
      messageAr: suspicious.messageAr,
      entityKind: "agent_mapping",
      entityId: primary.agentId,
    });
    return {
      state: "DATA_QUALITY_WARNING",
      invariant: "pass",
      activeAgentId: primary.agentId,
      activeAgentName: primary.agentName ?? primary.agentId,
      activeAgentCount: 1,
      inactiveAgentCount,
      issues,
    };
  }

  return {
    state: "PASS",
    invariant: "pass",
    activeAgentId: primary.agentId,
    activeAgentName: primary.agentName ?? primary.agentId,
    activeAgentCount: 1,
    inactiveAgentCount,
    issues,
  };
}

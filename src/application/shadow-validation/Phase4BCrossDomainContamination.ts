/**
 * Phase 4B — cross-domain user contamination counters (safe, no PII).
 * Shared `user` collection: Driver / Agent / Customer / Admin must not
 * incorrectly appear as multiple operational Admin Next domains.
 */

import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";
import {
  auditAgentDuplicates,
  rowFromCanonicalAgent,
} from "@/domain/agent/AgentDuplicateIdentityAudit";

export type CrossDomainContaminationResult = {
  crossDomainConflicts: number;
  roleContaminationCorrectlyExcluded: number;
  unknownIdentityCount: number;
  countriesWithOneActiveAgent: number;
  countriesWithNoAgent: number;
  countriesWithMultipleActiveAgents: number;
  conflictPairs: Array<{
    sourceDocumentId: string;
    domains: string[];
  }>;
};

function isOperationalDriver(d: CanonicalDriverReadModel): boolean {
  return (
    d.isOperationalDriver === true &&
    d.mappingStatus !== "excludedNonDriver" &&
    d.mappingStatus !== "testOrNoncanonical"
  );
}

function isOperationalAgent(a: CanonicalAgentReadModel): boolean {
  return (
    a.isOperationalAgent === true &&
    a.mappingStatus !== "excludedNonAgent" &&
    a.mappingStatus !== "testOrNoncanonical"
  );
}

function isOperationalCustomer(c: CanonicalCustomerReadModel): boolean {
  return (
    c.isOperationalCustomer === true &&
    c.mappingStatus !== "excludedNonCustomer" &&
    c.mappingStatus !== "excludedUnknownIdentity" &&
    c.mappingStatus !== "testOrNoncanonical"
  );
}

/**
 * Count identities that appear as operational in more than one domain
 * within the bounded page results (by sourceDocumentId).
 */
export function auditCrossDomainContamination(input: {
  drivers: CanonicalDriverReadModel[];
  agents: CanonicalAgentReadModel[];
  customers: CanonicalCustomerReadModel[];
  /** Optional country catalog for one-active-agent tracking. */
  knownCountryIds?: readonly string[];
}): CrossDomainContaminationResult {
  const domainsById = new Map<string, Set<string>>();

  const touch = (id: string, domain: string) => {
    const set = domainsById.get(id) ?? new Set<string>();
    set.add(domain);
    domainsById.set(id, set);
  };

  for (const d of input.drivers) {
    if (isOperationalDriver(d)) touch(d.sourceDocumentId, "driver");
  }
  for (const a of input.agents) {
    if (isOperationalAgent(a)) touch(a.sourceDocumentId, "agent");
  }
  for (const c of input.customers) {
    if (isOperationalCustomer(c)) touch(c.sourceDocumentId, "customer");
  }

  const conflictPairs: CrossDomainContaminationResult["conflictPairs"] = [];
  for (const [sourceDocumentId, domains] of domainsById) {
    if (domains.size > 1) {
      conflictPairs.push({
        sourceDocumentId,
        domains: [...domains].sort(),
      });
    }
  }

  let roleContaminationCorrectlyExcluded = 0;
  for (const d of input.drivers) {
    if (d.mappingStatus === "excludedNonDriver") {
      roleContaminationCorrectlyExcluded += 1;
    }
  }
  for (const a of input.agents) {
    if (a.mappingStatus === "excludedNonAgent") {
      roleContaminationCorrectlyExcluded += 1;
    }
  }
  for (const c of input.customers) {
    if (
      c.mappingStatus === "excludedNonCustomer" ||
      c.mappingStatus === "excludedUnknownIdentity"
    ) {
      roleContaminationCorrectlyExcluded += 1;
    }
  }

  const unknownIdentityCount = input.customers.filter(
    (c) => c.mappingStatus === "excludedUnknownIdentity",
  ).length;

  const agentMetrics = auditAgentDuplicates(
    input.agents.map((a) => rowFromCanonicalAgent(a)),
    { knownCountryIds: input.knownCountryIds },
  );

  return {
    crossDomainConflicts: conflictPairs.length,
    roleContaminationCorrectlyExcluded,
    unknownIdentityCount,
    countriesWithOneActiveAgent:
      agentMetrics.countriesWithOneActiveAgent.length,
    countriesWithNoAgent: agentMetrics.countriesWithNoAgent.length,
    countriesWithMultipleActiveAgents:
      agentMetrics.countriesWithMultipleActiveAgents.length,
    conflictPairs,
  };
}

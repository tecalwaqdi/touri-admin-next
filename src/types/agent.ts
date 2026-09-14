export type AgentStatus = "active" | "inactive" | "suspended";

export type Agent = {
  id: string;
  name: string;
  countryId: string;
  status: AgentStatus;
  commissionPlaceholder: string;
  driversCount: number;
  tripsCount: number;
  activeFromUtc: string | null;
  activeToUtc: string | null;
  createdAtUtc: string;
};

export type AgentAssignmentHistory = {
  id: string;
  countryId: string;
  previousAgentId: string | null;
  newAgentId: string;
  reason: string;
  approvedBy: string;
  endedPreviousAtUtc: string | null;
  startedNewAtUtc: string;
  createdAtUtc: string;
};

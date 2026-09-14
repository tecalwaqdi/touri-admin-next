import type { Agent, AgentAssignmentHistory } from "@/types/agent";
import type { ListParams, PaginatedResult } from "@/types/common";

export interface AgentRepository {
  list(params?: ListParams): Promise<PaginatedResult<Agent>>;
  getById(id: string): Promise<Agent | null>;
  listByCountry(countryId: string): Promise<Agent[]>;
  listAssignmentHistory(countryId: string): Promise<AgentAssignmentHistory[]>;
}

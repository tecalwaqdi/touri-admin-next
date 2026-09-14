import type { Settlement } from "@/domain/settlement/Settlement";
import type { ListParams, PaginatedResult } from "@/types/common";

export type SettlementListParams = ListParams & {
  partyType?: string;
  partyId?: string;
  currencyCode?: string;
  sort?: "createdAtUtc" | "status" | "periodFromUtc";
  sortDir?: "asc" | "desc";
};

export interface SettlementRepository {
  list(params?: SettlementListParams): Promise<PaginatedResult<Settlement>>;
  getById(id: string): Promise<Settlement | null>;
  save(settlement: Settlement): Promise<Settlement>;
  findClosedContainingTrip(tripId: string): Promise<Settlement | null>;
  findByIdempotencyKey(key: string): Promise<Settlement | null>;
}

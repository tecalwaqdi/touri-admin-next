import type { ListParams, PaginatedResult } from "@/types/common";
import type { Trip } from "@/types/trip";

export interface TripRepository {
  list(params?: ListParams): Promise<PaginatedResult<Trip>>;
  getById(id: string): Promise<Trip | null>;
}

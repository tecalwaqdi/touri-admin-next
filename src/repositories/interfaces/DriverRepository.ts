import type { ListParams, PaginatedResult } from "@/types/common";
import type { Driver } from "@/types/driver";

export interface DriverRepository {
  list(params?: ListParams): Promise<PaginatedResult<Driver>>;
  getById(id: string): Promise<Driver | null>;
  /** Optional — Admin Next controlled-write bridge sync. */
  save?(driver: Driver): Promise<Driver>;
}

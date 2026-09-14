import type { Customer, ListParams, PaginatedResult } from "@/types/common";

export interface CustomerRepository {
  list(params?: ListParams): Promise<PaginatedResult<Customer>>;
  getById(id: string): Promise<Customer | null>;
}

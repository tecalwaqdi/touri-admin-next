export type QueryState = "idle" | "loading" | "success" | "empty" | "error";

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  countryId?: string;
  cityId?: string;
  status?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  countryId: string;
  cityId: string;
  tripCount: number;
  completedTrips: number;
  cancelledTrips: number;
  status: "active" | "blocked" | "inactive";
  createdAtUtc: string;
};

export type MoneyAmount = {
  currencyCode: string;
  amount: number | null;
  confidence: "high" | "derived" | "incomplete" | "disputed";
};

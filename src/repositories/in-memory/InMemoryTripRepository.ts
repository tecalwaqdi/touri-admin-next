import type { ListParams } from "@/types/common";
import type { Trip } from "@/types/trip";
import type { TripRepository } from "@/repositories/interfaces/TripRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedTrips } from "@/test/fixtures/seed";

export class InMemoryTripRepository implements TripRepository {
  constructor(private readonly trips: Trip[] = [...seedTrips]) {}

  async list(params: ListParams = {}) {
    let filtered = [...this.trips];
    if (params.status) {
      filtered = filtered.filter((trip) => trip.status === params.status);
    }
    if (params.countryId) {
      filtered = filtered.filter((trip) => trip.countryId === params.countryId);
    }
    if (params.cityId) {
      filtered = filtered.filter((trip) => trip.cityId === params.cityId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (trip) =>
          trip.id.toLowerCase().includes(q) ||
          trip.customerName.toLowerCase().includes(q) ||
          (trip.driverName ?? "").toLowerCase().includes(q),
      );
    }
    return paginate(filtered, params.page, params.pageSize);
  }

  async getById(id: string) {
    return this.trips.find((trip) => trip.id === id) ?? null;
  }
}

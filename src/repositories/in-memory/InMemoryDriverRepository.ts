import type { ListParams } from "@/types/common";
import type { Driver } from "@/types/driver";
import type { DriverRepository } from "@/repositories/interfaces/DriverRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedDrivers } from "@/test/fixtures/seed";

export class InMemoryDriverRepository implements DriverRepository {
  private drivers: Driver[];

  constructor(drivers: Driver[] = seedDrivers.map((d) => structuredClone(d))) {
    this.drivers = drivers;
  }

  async list(params: ListParams = {}) {
    let filtered = [...this.drivers];
    if (params.countryId) {
      filtered = filtered.filter((d) => d.countryId === params.countryId);
    }
    if (params.status) {
      filtered = filtered.filter(
        (d) =>
          d.registrationStatus === params.status ||
          d.approvalStatus === params.status ||
          d.availabilityStatus === params.status,
      );
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q) ||
          d.vehiclePlate.toLowerCase().includes(q),
      );
    }
    return paginate(filtered, params.page, params.pageSize);
  }

  async getById(id: string) {
    return this.drivers.find((d) => d.id === id) ?? null;
  }

  async save(driver: Driver) {
    const idx = this.drivers.findIndex((d) => d.id === driver.id);
    if (idx >= 0) this.drivers[idx] = driver;
    else this.drivers.push(driver);
    return driver;
  }
}

import type { Customer, ListParams } from "@/types/common";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedCustomers } from "@/test/fixtures/seed";

export class InMemoryCustomerRepository implements CustomerRepository {
  private customers: Customer[];

  constructor(customers: Customer[] = seedCustomers.map((c) => structuredClone(c))) {
    this.customers = customers;
  }

  async list(params: ListParams = {}) {
    let filtered = [...this.customers];
    if (params.countryId) {
      filtered = filtered.filter((c) => c.countryId === params.countryId);
    }
    if (params.status) {
      filtered = filtered.filter((c) => c.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q),
      );
    }
    return paginate(filtered, params.page, params.pageSize);
  }

  async getById(id: string) {
    return this.customers.find((c) => c.id === id) ?? null;
  }

  async save(customer: Customer) {
    const idx = this.customers.findIndex((c) => c.id === customer.id);
    if (idx >= 0) this.customers[idx] = customer;
    else this.customers.push(customer);
    return customer;
  }
}

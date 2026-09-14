import type { AuthUser } from "@/types/auth";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";
import { seedUsers } from "@/test/fixtures/seed";

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: AuthUser[] = [...seedUsers]) {}

  async findByEmail(email: string) {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async list() {
    return [...this.users];
  }
}

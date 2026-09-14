import type { AuthUser } from "@/types/auth";

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  getById(id: string): Promise<AuthUser | null>;
  list(): Promise<AuthUser[]>;
}

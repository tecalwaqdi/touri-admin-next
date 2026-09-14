import type { AuthSession, AuthUser } from "@/types/auth";

export interface AuthProvider {
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  getSession(): Promise<AuthSession>;
}

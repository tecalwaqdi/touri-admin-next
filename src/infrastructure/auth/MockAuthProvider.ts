import type { AuthProvider } from "@/auth/AuthProvider";
import type { AuthSession, AuthUser, AuthMachineState } from "@/types/auth";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";
import { createCorrelationId, createAuditId } from "@/lib/ids";
import type { AuditRepository } from "@/repositories/interfaces/AuditRepository";
import { getEnv } from "@/config/env";

/**
 * Mock / Dev auth — no production Firebase Auth.
 * Password for all seed users: "password"
 */
export class MockAuthProvider implements AuthProvider {
  private currentUser: AuthUser | null = null;
  private state: AuthMachineState = "unauthenticated";
  private correlationId = createCorrelationId();
  private errorMessage?: string;

  constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async login(email: string, password: string): Promise<AuthUser> {
    this.state = "authorizing";
    this.correlationId = createCorrelationId();

    if (password !== "password") {
      this.state = "unauthenticated";
      this.errorMessage = "Invalid credentials";
      await this.audit.append({
        auditId: createAuditId(),
        actorUserId: "anonymous",
        actorRole: "anonymous",
        action: "login_failed",
        resourceType: "session",
        resourceId: null,
        reason: "invalid_password",
        environment: getEnv().APP_ENV,
        createdAtUtc: new Date().toISOString(),
        correlationId: this.correlationId,
      });
      throw new Error("Invalid credentials");
    }

    const user = await this.users.findByEmail(email);
    if (!user) {
      this.state = "unauthenticated";
      this.errorMessage = "User not found";
      await this.audit.append({
        auditId: createAuditId(),
        actorUserId: "anonymous",
        actorRole: "anonymous",
        action: "login_failed",
        resourceType: "session",
        resourceId: null,
        reason: "user_not_found",
        environment: getEnv().APP_ENV,
        createdAtUtc: new Date().toISOString(),
        correlationId: this.correlationId,
      });
      throw new Error("User not found");
    }

    if (user.status === "disabled") {
      this.state = "forbidden";
      this.currentUser = user;
      this.errorMessage = "Account disabled";
      throw new Error("Account disabled");
    }

    if (user.status === "expired" || user.status === "unauthorized") {
      this.state = "forbidden";
      this.currentUser = user;
      this.errorMessage = `Account ${user.status}`;
      throw new Error(`Account ${user.status}`);
    }

    this.currentUser = user;
    this.state = "authorized";
    this.errorMessage = undefined;

    await this.audit.append({
      auditId: createAuditId(),
      actorUserId: user.id,
      actorRole: user.role,
      action: "login",
      resourceType: "session",
      resourceId: user.id,
      environment: getEnv().APP_ENV,
      createdAtUtc: new Date().toISOString(),
      correlationId: this.correlationId,
    });

    return user;
  }

  async logout(): Promise<void> {
    const user = this.currentUser;
    this.currentUser = null;
    this.state = "unauthenticated";
    this.errorMessage = undefined;
    if (user) {
      await this.audit.append({
        auditId: createAuditId(),
        actorUserId: user.id,
        actorRole: user.role,
        action: "logout",
        resourceType: "session",
        resourceId: user.id,
        environment: getEnv().APP_ENV,
        createdAtUtc: new Date().toISOString(),
        correlationId: this.correlationId,
      });
    }
    this.correlationId = createCorrelationId();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return this.currentUser;
  }

  async getSession(): Promise<AuthSession> {
    return {
      user: this.currentUser,
      state: this.state,
      errorMessage: this.errorMessage,
      correlationId: this.correlationId,
    };
  }

  /** Test helper to set session without login UI */
  setSessionForTests(user: AuthUser | null, state: AuthMachineState = user ? "authorized" : "unauthenticated") {
    this.currentUser = user;
    this.state = state;
  }
}

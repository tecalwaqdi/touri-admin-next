import { describe, expect, it, beforeEach } from "vitest";
import { MockAuthProvider } from "@/infrastructure/auth/MockAuthProvider";
import { InMemoryUserRepository } from "@/repositories/in-memory/InMemoryUserRepository";
import { InMemoryAuditRepository } from "@/repositories/in-memory/InMemoryAuditRepository";

describe("mock auth provider", () => {
  let auth: MockAuthProvider;
  let audit: InMemoryAuditRepository;

  beforeEach(() => {
    audit = new InMemoryAuditRepository();
    auth = new MockAuthProvider(new InMemoryUserRepository(), audit);
  });

  it("logs in with valid credentials", async () => {
    const user = await auth.login("super@touri.local", "password");
    expect(user.role).toBe("super_admin");
    const session = await auth.getSession();
    expect(session.state).toBe("authorized");
    const events = await audit.list();
    expect(events[0]?.action).toBe("login");
  });

  it("rejects disabled accounts", async () => {
    await expect(auth.login("disabled@touri.local", "password")).rejects.toThrow(
      /disabled/i,
    );
    const session = await auth.getSession();
    expect(session.state).toBe("forbidden");
  });

  it("logs out and clears session", async () => {
    await auth.login("super@touri.local", "password");
    await auth.logout();
    expect(await auth.getCurrentUser()).toBeNull();
    expect((await auth.getSession()).state).toBe("unauthenticated");
  });
});

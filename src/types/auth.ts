import type { AccessScope, Permission, Role } from "@/types/roles";

export type AuthMachineState =
  | "initializing"
  | "unauthenticated"
  | "authenticated"
  | "authorizing"
  | "authorized"
  | "forbidden"
  | "error";

export type SessionStatus = "active" | "expired" | "disabled" | "unauthorized";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
  status: SessionStatus;
  locale: "ar" | "en";
};

export type AuthSession = {
  user: AuthUser | null;
  state: AuthMachineState;
  errorMessage?: string;
  correlationId: string;
};

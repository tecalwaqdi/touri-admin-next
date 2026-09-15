/**
 * PC-4 — Admin user list/detail DTOs (server-authoritative roles; PII masked).
 */

import type { AccessScope, Role } from "@/types/roles";
import type { AdminDataSourceLabelView } from "@/domain/production-read/SourceLabel";

export type AdminUserListItem = {
  id: string;
  emailMasked: string | null;
  displayName: string;
  role: Role;
  scopeType: AccessScope["type"];
  scopeCountryIds: string[];
  scopeAgentIds: string[];
  status: "active" | "disabled" | "unknown";
  permissionCount: number;
  legacyRule: number;
  dataQualityWarnings: string[];
  /** Roles are never client-derived. */
  roleSource: "server_panel_claims_mirror";
};

export type AdminUserDetailDto = AdminUserListItem & {
  availability: "available";
  sourceLabel: AdminDataSourceLabelView;
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  transport: "wif_native";
  synthetic: false;
  piiRedacted: true;
  permissions: string[];
};

export type AdminUserListResponse = {
  items: AdminUserListItem[];
  total: number;
  truncated: boolean;
  nextCursor: string | null;
  unavailable: false;
  synthetic: false;
  sourceLabel: AdminDataSourceLabelView;
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  transport: "wif_native";
  bounded: true;
  maxItems: number;
  dataQualityWarnings: string[];
};

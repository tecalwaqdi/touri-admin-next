/**
 * Phase 4A-0 — architecture boundary helpers.
 * UI features must not import production infrastructure / firebase-admin.
 */

export {
  SHADOW_NAV_ALLOWED,
  SHADOW_NAV_HIDDEN,
  type ShadowNavItem,
  type HiddenShadowNavItem,
} from "@/domain/ui/ShadowNav";

export const FORBIDDEN_UI_IMPORT_PATTERNS = [
  "@/infrastructure/production/",
  "firebase-admin",
  "firebase/firestore",
] as const;

export const FORBIDDEN_APPLICATION_IMPORT_PATTERNS = [
  "firebase-admin",
] as const;

export const FORBIDDEN_DOMAIN_IMPORT_PATTERNS = [
  "firebase-admin",
  "@/infrastructure/production/firebase",
] as const;

export const ALLOWED_UI_DEPENDENCY_LAYERS = [
  "@/application/",
  "@/features/",
  "@/components/",
  "@/lib/",
  "@/domain/",
  "@/permissions/",
  "@/auth/",
  "@/i18n/",
  "@/types/",
  "@/config/",
] as const;

/**
 * Pure string check used by tests scanning import lines.
 */
export function isForbiddenUiImport(importPath: string): boolean {
  const p = importPath.replace(/['"]/g, "");
  if (p.includes("firebase-admin")) return true;
  if (p.includes("firebase/firestore")) return true;
  if (p.includes("infrastructure/production")) return true;
  return false;
}

export function isForbiddenApplicationImport(importPath: string): boolean {
  const p = importPath.replace(/['"]/g, "");
  return p.includes("firebase-admin");
}

export function isForbiddenDomainImport(importPath: string): boolean {
  const p = importPath.replace(/['"]/g, "");
  if (p.includes("firebase-admin")) return true;
  if (p.includes("infrastructure/production/firebase")) return true;
  return false;
}

/**
 * Production Firebase Auth project (email/password SDK).
 * Keep connect-src / frame-src allowlists minimal — never '*'.
 */
export const DEFAULT_FIREBASE_AUTH_DOMAIN =
  "tutorial-multi-language-70gx4j.firebaseapp.com";

/** HTTPS origin for the configured Firebase Auth domain (no secrets). */
export function resolveFirebaseAuthOrigin(
  authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
): string {
  const raw = (authDomain ?? DEFAULT_FIREBASE_AUTH_DOMAIN).trim();
  if (!raw) return `https://${DEFAULT_FIREBASE_AUTH_DOMAIN}`;
  if (/^https:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return `https://${raw.replace(/^\/+/, "").replace(/\/$/, "")}`;
}

/**
 * CSP for Admin Next. Firebase Auth email/password requires Identity Toolkit +
 * Secure Token HTTPS endpoints; authDomain may be used for session iframe.
 */
export function buildContentSecurityPolicy(
  authOrigin = resolveFirebaseAuthOrigin(),
): string {
  const connectSrc = [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    authOrigin,
  ].join(" ");

  // blob: required for secure driver/landmark document preview (createObjectURL).
  const frameSrc = [`'self'`, "blob:", authOrigin].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    // Landmark admin thumbnails use stored https download URLs (Firebase Storage / CDN).
    // blob: required for secure proxied driver/landmark image preview in-page.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

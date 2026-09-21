import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  resolveFirebaseAuthOrigin,
} from "@/lib/contentSecurityPolicy";

describe("middleware CSP Firebase Auth allowlist", () => {
  it("allows Identity Toolkit and Secure Token over HTTPS (not *)", () => {
    const csp = buildContentSecurityPolicy(
      "https://tutorial-multi-language-70gx4j.firebaseapp.com",
    );
    expect(csp).toContain(
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://tutorial-multi-language-70gx4j.firebaseapp.com",
    );
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
  });

  it("allows authDomain in frame-src for Firebase Auth iframe", () => {
    const origin = "https://tutorial-multi-language-70gx4j.firebaseapp.com";
    const csp = buildContentSecurityPolicy(origin);
    expect(csp).toContain(`frame-src 'self' blob: ${origin}`);
    expect(csp).not.toMatch(/frame-src[^;]*\*/);
  });

  it("allows blob: for secure document image and PDF preview", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/img-src[^;]*blob:/);
    expect(csp).toMatch(/frame-src[^;]*blob:/);
    expect(csp).toContain("object-src 'none'");
  });

  it("resolves authDomain hostname to https origin", () => {
    expect(
      resolveFirebaseAuthOrigin("tutorial-multi-language-70gx4j.firebaseapp.com"),
    ).toBe("https://tutorial-multi-language-70gx4j.firebaseapp.com");
    expect(
      resolveFirebaseAuthOrigin(
        "https://tutorial-multi-language-70gx4j.firebaseapp.com/",
      ),
    ).toBe("https://tutorial-multi-language-70gx4j.firebaseapp.com");
  });

  it("defaults to production Firebase auth domain when unset", () => {
    expect(resolveFirebaseAuthOrigin(undefined)).toBe(
      "https://tutorial-multi-language-70gx4j.firebaseapp.com",
    );
    expect(resolveFirebaseAuthOrigin("")).toBe(
      "https://tutorial-multi-language-70gx4j.firebaseapp.com",
    );
  });

  it("keeps script-src scoped (no wildcard Google script CDN)", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*\*/);
  });
});

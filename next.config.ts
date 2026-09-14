import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  /** Keep firebase-admin out of client/edge bundles — server-only, lazy-gated. */
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/contentSecurityPolicy";

const staticSecurityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(staticSecurityHeaders)) {
    response.headers.set(key, value);
  }
  // Build CSP per request so authDomain / connect-src always match runtime env.
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  response.headers.set("X-Admin-Next-Env", process.env.NEXT_PUBLIC_APP_ENV ?? "development");
  // Ensure request path is available for future audit correlation
  response.headers.set("X-Request-Path", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

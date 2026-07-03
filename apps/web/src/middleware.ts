import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware runs on every matched route.
 *
 * Protection layers:
 * 1. Auth check — redirect unauthenticated users to login
 * 2. Security headers — added to all responses
 * 3. Rate limiting — basic in-memory (production: use DynamoDB or Redis)
 */

// Simple in-memory rate limiter (per-process, resets on restart)
// In production, use DynamoDB atomic counters or API Gateway throttling
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't need auth
  const publicPaths = ["/login", "/api/auth", "/api/health"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return NextResponse.next();
  }

  // Check auth token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API routes return 401; pages redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Rate limiting for API routes
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    const identifier = `${token.sub || "unknown"}-${pathname}`;
    // 30 requests per minute per user per endpoint
    const allowed = checkRateLimit(identifier, 30, 60_000);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 }
      );
    }
  }

  // Add security headers to response
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};

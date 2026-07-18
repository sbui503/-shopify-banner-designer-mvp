import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

function secure(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginApi = pathname === "/api/admin/login";
  const isLogoutApi = pathname === "/api/admin/logout";
  const authenticated = verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (isLoginApi || isLogoutApi) return secure(NextResponse.next());

  if (pathname === "/login") {
    return authenticated
      ? secure(NextResponse.redirect(new URL("/admin", request.url)))
      : secure(NextResponse.next());
  }

  const isProtectedApi = pathname.startsWith("/api/admin")
    || pathname === "/api/designs"
    || pathname === "/api/fulfillment-lookup"
    || pathname === "/api/send-proof-email";
  if (!authenticated && isProtectedApi) {
    return secure(NextResponse.json({ error: "Authentication required." }, { status: 401 }));
  }

  const isProtectedPage = pathname.startsWith("/admin") || pathname === "/fulfillment.html";
  if (!authenticated && isProtectedPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return secure(NextResponse.redirect(loginUrl));
  }

  return secure(NextResponse.next());
}

export const config = {
  matcher: [
    "/login",
    "/admin/:path*",
    "/fulfillment.html",
    "/api/admin/:path*",
    "/api/designs",
    "/api/fulfillment-lookup",
    "/api/send-proof-email"
  ]
};

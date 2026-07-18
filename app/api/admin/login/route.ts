import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSession,
  isAdminAuthConfigured,
  validateAdminCredentials
} from "@/lib/admin-auth";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  if (!validateAdminCredentials(body.username, body.password)) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const nextPath = typeof body.nextPath === "string" && body.nextPath.startsWith("/admin")
    ? body.nextPath
    : "/admin";
  const response = NextResponse.json({ ok: true, nextPath }, { headers: NO_STORE_HEADERS });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSession(String(body.username)),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE
  });
  return response;
}

import { NextResponse } from "next/server";
import { adminBuildVersion } from "@/lib/admin-build-version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { version: adminBuildVersion() },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

import { NextResponse } from "next/server";
import { getRequestSession, isAdminConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getRequestSession(req);
  return NextResponse.json({
    role: session?.role ?? null,
    username: session?.username ?? null,
    expiresAt: session?.expiresAt ?? null,
    adminConfigured: isAdminConfigured(),
  });
}
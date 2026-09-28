import { NextResponse } from "next/server";
import { AUTH_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { ...sessionCookieOptions(req), maxAge: 0 });
  return response;
}
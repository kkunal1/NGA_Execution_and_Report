import { NextResponse } from "next/server";
import { authenticate, createSessionToken, getSessionExpiresAt, isAdminConfigured, sessionCookieOptions } from "@/lib/auth";
import { recordSuccessfulLogin } from "@/lib/login-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function GET() {
  return NextResponse.json({ adminConfigured: await isAdminConfigured() });
}

export async function POST(req: Request) {
  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= 10) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    if (typeof body.username === "string") username = body.username.trim();
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Enter a username and password." }, { status: 400 });
  }

  const role = await authenticate(username, password);
  if (!role) {
    attempts.set(address, {
      count: current && current.resetAt > now ? current.count + 1 : 1,
      resetAt: current && current.resetAt > now ? current.resetAt : now + 15 * 60 * 1000,
    });
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  attempts.delete(address);
  await recordSuccessfulLogin(req, username, role);
  const expiresAt = getSessionExpiresAt(role);
  const response = NextResponse.json({ role, username, expiresAt });
  response.cookies.set("nga-portal-session", await createSessionToken(role, username, expiresAt), sessionCookieOptions(req, role));
  return response;
}
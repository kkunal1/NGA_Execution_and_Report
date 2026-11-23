import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";
import { sendTemporaryTestEmail } from "@/lib/smtp-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getRequestSession(req);
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    const body = await req.json() as { sender?: unknown; recipient?: unknown; password?: unknown };
    if (typeof body.sender !== "string" || typeof body.recipient !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Enter a sender, one test recipient, and your SMTP password." }, { status: 400 });
    }
    const result = await sendTemporaryTestEmail(body.sender, body.password, body.recipient);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send the test email." }, { status: 502 });
  }
}
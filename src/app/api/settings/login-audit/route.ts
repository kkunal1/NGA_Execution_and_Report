import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getLoginAudit } from "@/lib/login-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    return NextResponse.json({ entries: await getLoginAudit() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load login audit." }, { status: 500 });
  }
}

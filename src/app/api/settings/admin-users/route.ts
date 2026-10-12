import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { addAdminUser, listAdminUsers } from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json({ admins: await listAdminUsers() });
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    const admin = await addAdminUser(body.username, body.password);
    return NextResponse.json({ admin }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add admin." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
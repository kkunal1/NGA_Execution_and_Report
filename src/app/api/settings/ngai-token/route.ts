import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getNgaiTokenStatus, removeNgaiApiToken, saveNgaiApiToken } from "@/lib/ngai-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json(await getNgaiTokenStatus());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json({ error: "Enter an NGAi API token." }, { status: 400 });
    }
    await saveNgaiApiToken(body.token.trim());
    return NextResponse.json(await getNgaiTokenStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the NGAi token." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    await removeNgaiApiToken();
    return NextResponse.json(await getNgaiTokenStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the saved NGAi token." },
      { status: 500 },
    );
  }
}
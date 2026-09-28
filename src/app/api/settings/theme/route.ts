import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getSharedTheme, saveSharedTheme } from "@/lib/app-theme";
import { isThemeId } from "@/lib/theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  return NextResponse.json({ theme: await getSharedTheme() });
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { theme?: unknown };
    if (typeof body.theme !== "string" || !isThemeId(body.theme)) {
      return NextResponse.json({ error: "Choose a valid theme." }, { status: 400 });
    }
    await saveSharedTheme(body.theme);
    return NextResponse.json({ theme: body.theme });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save theme." }, { status: 500 });
  }
}
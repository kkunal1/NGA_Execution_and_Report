import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getRefreshSettings, getRefreshStatus, saveRefreshSettings, validateRefreshInterval } from "@/lib/refresh-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json({ ...await getRefreshSettings(), ...await getRefreshStatus() });
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { intervalSeconds?: unknown };
    const intervalSeconds = validateRefreshInterval(body.intervalSeconds);
    if (intervalSeconds == null) {
      return NextResponse.json({ error: "Enter 0 to disable refresh, or an interval from 15 to 3600 seconds." }, { status: 400 });
    }
    const settings = { intervalSeconds };
    await saveRefreshSettings(settings);
    return NextResponse.json({ ...settings, ...await getRefreshStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save refresh settings." }, { status: 400 });
  }
}
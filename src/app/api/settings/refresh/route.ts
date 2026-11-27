import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getRefreshSettings, getRefreshStatus, saveRefreshSettings, validateRefreshInterval, validateRefreshIntervals } from "@/lib/refresh-settings";

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
    const body = (await req.json()) as { intervalSeconds?: unknown; intervalByCycle?: unknown; autoRefreshByCycle?: unknown };
    const intervalSeconds = validateRefreshInterval(body.intervalSeconds);
    if (intervalSeconds == null) {
      return NextResponse.json({ error: "Enter 0 to disable refresh, or an interval from 15 to 86400 seconds." }, { status: 400 });
    }
    const intervalByCycle = body.intervalByCycle === undefined ? undefined : validateRefreshIntervals(body.intervalByCycle);
    if (body.intervalByCycle !== undefined && intervalByCycle == null) return NextResponse.json({ error: "Each cycle interval must be 0, or a whole number from 15 to 86400 seconds." }, { status: 400 });
    if (body.autoRefreshByCycle !== undefined && (!body.autoRefreshByCycle || typeof body.autoRefreshByCycle !== "object" || Array.isArray(body.autoRefreshByCycle))) {
      return NextResponse.json({ error: "Cycle refresh settings must be an object." }, { status: 400 });
    }
    const settings = {
      intervalSeconds,
      ...(intervalByCycle === undefined ? {} : { intervalByCycle }),
      ...(body.autoRefreshByCycle === undefined ? {} : { autoRefreshByCycle: body.autoRefreshByCycle }),
    };
    await saveRefreshSettings(settings);
    return NextResponse.json({ ...await getRefreshSettings(), ...await getRefreshStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save refresh settings." }, { status: 400 });
  }
}
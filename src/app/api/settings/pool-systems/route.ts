import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getPoolSystemSettings, normalizePoolNames, savePoolSystemSettings } from "@/lib/pool-system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json(await getPoolSystemSettings());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { poolNames?: unknown };
    const poolNames = normalizePoolNames(body.poolNames);
    if (!poolNames) return NextResponse.json({ error: "Enter 1 to 20 unique pool names using letters, numbers, dots, underscores, or hyphens." }, { status: 400 });
    return NextResponse.json(await savePoolSystemSettings(poolNames));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save pool system settings." }, { status: 500 });
  }
}
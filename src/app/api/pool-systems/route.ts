import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { fetchPoolSystems } from "@/lib/pool-systems";
import { getPoolSystemSettings } from "@/lib/pool-system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const { poolNames } = await getPoolSystemSettings();
    return NextResponse.json({ poolNames, systems: await fetchPoolSystems(poolNames) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load pool systems." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { fetchPoolSystems, NGAI_POOL_NAME } from "@/lib/pool-systems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    return NextResponse.json({ poolName: NGAI_POOL_NAME, systems: await fetchPoolSystems() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load pool systems." },
      { status: 502 },
    );
  }
}

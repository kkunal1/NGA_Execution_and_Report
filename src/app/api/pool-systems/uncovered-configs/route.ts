import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { fetchUncoveredConfigs } from "@/lib/pool-systems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    return NextResponse.json({ configs: await fetchUncoveredConfigs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load config coverage." },
      { status: 502 },
    );
  }
}

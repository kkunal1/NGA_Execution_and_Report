import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getPoolSystemSettings, selectConfiguredPoolNames } from "@/lib/pool-system-settings";
import { fetchUncoveredConfigs } from "@/lib/pool-systems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const configured = await getPoolSystemSettings();
    const selectedPoolNames = selectConfiguredPoolNames(configured.poolNames, new URL(req.url).searchParams.getAll("poolName"));
    if (!selectedPoolNames) return NextResponse.json({ error: "Select only pools configured in Settings." }, { status: 400 });
    return NextResponse.json(await fetchUncoveredConfigs(selectedPoolNames));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load config coverage." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { fetchPoolSystems } from "@/lib/pool-systems";
import { getPoolSystemSettings, selectConfiguredPoolNames } from "@/lib/pool-system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const { poolNames } = await getPoolSystemSettings();
    const params = new URL(req.url).searchParams;
    const hasSelection = params.get("filterPools") === "1";
    const selectedPoolNames = hasSelection
      ? selectConfiguredPoolNames(poolNames, params.getAll("poolName"))
      : poolNames;
    if (!selectedPoolNames) return NextResponse.json({ error: "Select only pools configured in Settings." }, { status: 400 });
    const systems = selectedPoolNames.length ? await fetchPoolSystems(selectedPoolNames) : [];
    return NextResponse.json({ poolNames, selectedPoolNames, systems });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load pool systems." },
      { status: 502 },
    );
  }
}

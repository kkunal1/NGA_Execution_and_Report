import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { fetchExecutionHistory, fetchPlannedConfigurations } from "@/lib/execution-data";
import { B0_SUITES, B2_SUITES } from "@/lib/execution-suites";
import { getExecutionMenuOrder, listCustomExecutionTabs } from "@/lib/execution-tabs";
import { getRefreshSettings } from "@/lib/refresh-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function cycles() {
  const [refresh, tabs, order] = await Promise.all([getRefreshSettings(), listCustomExecutionTabs(), getExecutionMenuOrder()]);
  const result = [
    { id: "b0", name: "DMR AP1 PV B0 Execution", suiteNames: refresh.suitesByProfile.b0.length ? refresh.suitesByProfile.b0 : [B0_SUITES.P1, B0_SUITES.P2] },
    { id: "b2", name: "DMR AP1 PV B2 Execution", suiteNames: refresh.suitesByProfile.b2.length ? refresh.suitesByProfile.b2 : [B2_SUITES.P1, B2_SUITES.P2] },
    ...tabs.filter((tab) => tab.enabled).map((tab) => ({ id: tab.id, name: tab.name, suiteNames: tab.suiteNames })),
  ];
  return result.sort((left, right) => (order.indexOf(left.id) < 0 ? order.length : order.indexOf(left.id)) - (order.indexOf(right.id) < 0 ? order.length : order.indexOf(right.id)));
}

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  try { return NextResponse.json({ cycles: await cycles() }); }
  catch { return NextResponse.json({ error: "Could not load execution cycles." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  try {
    const body = await req.json() as { cycleId?: unknown; suiteName?: unknown };
    const cycle = (await cycles()).find((item) => item.id === body.cycleId);
    if (!cycle || (body.suiteName !== undefined && (typeof body.suiteName !== "string" || !cycle.suiteNames.includes(body.suiteName)))) {
      return NextResponse.json({ error: "Select an available execution cycle or suite." }, { status: 400 });
    }
    const suiteNames = typeof body.suiteName === "string" ? [body.suiteName] : cycle.suiteNames;
    const [result, plannedConfigurations] = await Promise.all([
      fetchExecutionHistory(suiteNames),
      fetchPlannedConfigurations(suiteNames).catch(() => null),
    ]);
    return NextResponse.json({ cycle, suiteNames, result: { ...result, cycleName: cycle.name, suiteNames, plannedConfigurations } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load execution history." }, { status: 502 });
  }
}
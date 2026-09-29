import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getDashboardSettings, saveDashboardSettings } from "@/lib/dashboard-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  return NextResponse.json(await getDashboardSettings());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Partial<Record<keyof Awaited<ReturnType<typeof getDashboardSettings>>, unknown>>;
    if (typeof body.executionStatusSplit !== "boolean" || typeof body.rawStateValues !== "boolean" ||
      typeof body.poolSystems !== "boolean" || typeof body.executionTime !== "boolean" ||
      typeof body.ngaiTestRunData !== "boolean") {
      return NextResponse.json({ error: "Dashboard and menu settings must be boolean values." }, { status: 400 });
    }
    const settings = {
      executionStatusSplit: body.executionStatusSplit,
      rawStateValues: body.rawStateValues,
      poolSystems: body.poolSystems,
      executionTime: body.executionTime,
      ngaiTestRunData: body.ngaiTestRunData,
    };
    await saveDashboardSettings(settings);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save dashboard settings." }, { status: 500 });
  }
}

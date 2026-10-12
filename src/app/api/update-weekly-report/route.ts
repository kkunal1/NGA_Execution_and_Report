import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json(await getWeeklyReportSettings());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Parameters<typeof saveWeeklyReportSettings>[0];
    return NextResponse.json(await saveWeeklyReportSettings(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Weekly Report settings." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";

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
    const body = (await req.json()) as { bkc?: unknown; teamPlatformCounts?: unknown; hsdesLink?: unknown };
    const bkc = normalizeWeeklyReportBkc(body.bkc);
    const teamPlatformCounts = normalizeTeamPlatformCounts(body.teamPlatformCounts);
    const hsdesLink = normalizeWeeklyReportHsdesLink(body.hsdesLink);
    if (!bkc || !teamPlatformCounts || !hsdesLink) {
      return NextResponse.json({ error: "Enter a valid BKC value, HSDES General Apps link with queryId, and one to 20 unique teams with whole-number X1/X4 counts." }, { status: 400 });
    }
    return NextResponse.json(await saveWeeklyReportSettings(bkc, teamPlatformCounts, hsdesLink));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the BKC value." }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, normalizeWeeklyReportLinks, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";

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
    const body = (await req.json()) as { bkc?: unknown; teamPlatformCounts?: unknown; hsdesLink?: unknown; links?: unknown };
    const bkc = normalizeWeeklyReportBkc(body.bkc);
    const teamPlatformCounts = normalizeTeamPlatformCounts(body.teamPlatformCounts);
    const hsdesLink = normalizeWeeklyReportHsdesLink(body.hsdesLink);
    const links = normalizeWeeklyReportLinks(body.links);
    if (!bkc || !teamPlatformCounts || !hsdesLink || !links) {
      return NextResponse.json({ error: "Enter a valid BKC value, HSDES query link, up to 20 HTTPS report links, and one to 20 unique teams with whole-number X1/X4 counts." }, { status: 400 });
    }
    return NextResponse.json(await saveWeeklyReportSettings(bkc, teamPlatformCounts, hsdesLink, links));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Weekly Report settings." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
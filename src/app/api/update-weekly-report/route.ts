import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings, normalizeCpuBreakdownTitle, normalizeCpuColumns, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, normalizeWeeklyReportLinks, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";

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
    const body = (await req.json()) as { bkc?: unknown; teamPlatformCounts?: unknown; cpuColumns?: unknown; cpuBreakdownTitle?: unknown; hsdesLink?: unknown; links?: unknown };
    const bkc = normalizeWeeklyReportBkc(body.bkc);
    const cpuColumns = normalizeCpuColumns(body.cpuColumns);
    const cpuBreakdownTitle = normalizeCpuBreakdownTitle(body.cpuBreakdownTitle);
    const teamPlatformCounts = cpuColumns && normalizeTeamPlatformCounts(body.teamPlatformCounts, cpuColumns);
    const hsdesLink = normalizeWeeklyReportHsdesLink(body.hsdesLink);
    const links = normalizeWeeklyReportLinks(body.links);
    if (!bkc || !cpuColumns || !cpuBreakdownTitle || !teamPlatformCounts || !hsdesLink || !links) {
      return NextResponse.json({ error: "Enter a valid BKC, CPU breakdown title, HSDES query link, report links, and 1 to 20 teams with up to 10 unique CPU columns and whole-number counts." }, { status: 400 });
    }
    return NextResponse.json(await saveWeeklyReportSettings(bkc, teamPlatformCounts, hsdesLink, links, cpuColumns, cpuBreakdownTitle));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Weekly Report settings." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
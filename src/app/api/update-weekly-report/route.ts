import { NextResponse } from "next/server";
import { authorizeWeeklyReportFeature } from "@/lib/weekly-report-access";
import { getWeeklyReportSettings, normalizeCpuBaseLabels, normalizeCpuBreakdownTitle, normalizeCpuColumns, normalizeCustomReportTables, normalizeExecutionSummaryText, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, normalizeWeeklyReportLinks, normalizeWeeklyReportSuites, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportUpdate");
  if (denied) return denied;
  return NextResponse.json(await getWeeklyReportSettings());
}

export async function PUT(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportUpdate");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { bkc?: unknown; suites?: unknown; executionSummaryText?: unknown; cpuAllocationEnabled?: unknown; teamPlatformCounts?: unknown; cpuColumns?: unknown; cpuBaseLabels?: unknown; cpuBreakdownTitle?: unknown; hsdesLink?: unknown; links?: unknown; customTables?: unknown };
    const bkc = normalizeWeeklyReportBkc(body.bkc);
    const suites = normalizeWeeklyReportSuites(body.suites);
    const executionSummaryText = normalizeExecutionSummaryText(body.executionSummaryText);
    const cpuColumns = normalizeCpuColumns(body.cpuColumns);
    const cpuBaseLabels = normalizeCpuBaseLabels(body.cpuBaseLabels);
    const cpuBreakdownTitle = normalizeCpuBreakdownTitle(body.cpuBreakdownTitle);
    const teamPlatformCounts = cpuColumns && normalizeTeamPlatformCounts(body.teamPlatformCounts, cpuColumns);
    const hsdesLink = normalizeWeeklyReportHsdesLink(body.hsdesLink);
    const links = normalizeWeeklyReportLinks(body.links);
    const customTables = body.customTables === undefined ? undefined : normalizeCustomReportTables(body.customTables);
    if (!bkc || !suites || executionSummaryText === null || typeof body.cpuAllocationEnabled !== "boolean" || !cpuColumns || !cpuBaseLabels || !cpuBreakdownTitle || !teamPlatformCounts || !hsdesLink || !links || (body.customTables !== undefined && !customTables)) {
      return NextResponse.json({ error: "Enter a valid BKC, one to 20 unique NGAi suites, execution summary text under 10,000 characters, CPU breakdown title, HSDES query link, report links, and valid team counts." }, { status: 400 });
    }
    return NextResponse.json(await saveWeeklyReportSettings(bkc, teamPlatformCounts, hsdesLink, links, cpuColumns, cpuBreakdownTitle, cpuBaseLabels, customTables, suites, executionSummaryText, body.cpuAllocationEnabled));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Weekly Report settings." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
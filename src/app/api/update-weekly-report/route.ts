import { NextResponse } from "next/server";
import { authorizeWeeklyReportFeature } from "@/lib/weekly-report-access";
import { getWeeklyReportSettings, moveWeeklyReportTable, normalizeCpuBaseLabels, normalizeCpuBreakdownTitle, normalizeCpuColumns, normalizeCustomReportTables, normalizeExecutionSummaryText, normalizeTeamPlatformCounts, normalizeWeeklyReportBkc, normalizeWeeklyReportHsdesLink, normalizeWeeklyReportLinks, normalizeWeeklyReportSuites, saveWeeklyReportSettings } from "@/lib/weekly-report-settings";
import { listWeeklyReportCycles } from "@/lib/weekly-report-cycles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportUpdate");
  if (denied) return denied;
  try {
    const cycleId = new URL(req.url).searchParams.get("cycleId") ?? "b2";
    const [settings, cycles] = await Promise.all([getWeeklyReportSettings(cycleId), listWeeklyReportCycles()]);
    return NextResponse.json({ ...settings, cycleId, cycles });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Weekly Report settings." }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportUpdate");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { cycleId?: unknown; bkc?: unknown; suites?: unknown; executionSummaryText?: unknown; emailSubjectTemplate?: unknown; cpuAllocationPresent?: unknown; cpuAllocationEnabled?: unknown; teamPlatformCounts?: unknown; cpuColumns?: unknown; cpuBaseLabels?: unknown; cpuBreakdownTitle?: unknown; hsdesLink?: unknown; links?: unknown; customTables?: unknown };
    const cycleId = typeof body.cycleId === "string" ? body.cycleId : "b2";
    const cycles = await listWeeklyReportCycles();
    if (!cycles.some((cycle) => cycle.id === cycleId)) {
      return NextResponse.json({ error: "Select an available execution cycle." }, { status: 400 });
    }
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
    const settings = await saveWeeklyReportSettings(bkc, teamPlatformCounts, hsdesLink, links, cpuColumns, cpuBreakdownTitle, cpuBaseLabels, customTables, suites, executionSummaryText, body.cpuAllocationEnabled, cycleId, body.cpuAllocationPresent ?? true, body.emailSubjectTemplate);
    return NextResponse.json({ ...settings, cycleId, cycles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Weekly Report settings." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportUpdate");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { sourceCycleId?: unknown; targetCycleId?: unknown; tableId?: unknown };
    const cycles = await listWeeklyReportCycles();
    if (typeof body.sourceCycleId !== "string" || typeof body.targetCycleId !== "string"
      || !cycles.some((cycle) => cycle.id === body.sourceCycleId) || !cycles.some((cycle) => cycle.id === body.targetCycleId)
      || (body.tableId !== null && (typeof body.tableId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(body.tableId)))) {
      return NextResponse.json({ error: "Select an available source cycle, target cycle, and table." }, { status: 400 });
    }
    const settings = await moveWeeklyReportTable(body.sourceCycleId, body.targetCycleId, body.tableId);
    return NextResponse.json({ ...settings, cycleId: body.sourceCycleId, cycles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not move the report table." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
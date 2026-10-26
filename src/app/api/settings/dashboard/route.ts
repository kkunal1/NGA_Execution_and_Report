import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getDashboardSettings, saveDashboardSettings, type DashboardSettings, type WeeklyReportSectionSettings } from "@/lib/dashboard-settings";

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
    const currentSettings = await getDashboardSettings();
    const weeklyReportSections = body.weeklyReportSections ?? currentSettings.weeklyReportSections;
    const validWeeklyReportSections = typeof weeklyReportSections === "object" && weeklyReportSections !== null &&
      typeof (weeklyReportSections as WeeklyReportSectionSettings).cpuAllocation === "boolean" &&
      typeof (weeklyReportSections as WeeklyReportSectionSettings).hsdFailureSummary === "boolean" &&
      typeof (weeklyReportSections as WeeklyReportSectionSettings).domainWise === "boolean" &&
      typeof (weeklyReportSections as WeeklyReportSectionSettings).overallFailureBreakdown === "boolean";
    if (typeof body.executionStatusSplit !== "boolean" || typeof body.rawStateValues !== "boolean" ||
      typeof body.showManualAborts !== "boolean" ||
      typeof body.poolSystems !== "boolean" || typeof body.weeklyReport !== "boolean" || typeof body.executionTime !== "boolean" ||
      (body.weeklyReportUpdate !== undefined && typeof body.weeklyReportUpdate !== "boolean") ||
      (body.weeklyReportEmail !== undefined && typeof body.weeklyReportEmail !== "boolean") ||
      !validWeeklyReportSections || typeof body.ngaiTestRunData !== "boolean" ||
      (body.weeklyReportMode !== "dateRange" && body.weeklyReportMode !== "workWeek")) {
      return NextResponse.json({ error: "Invalid dashboard or Weekly Report settings." }, { status: 400 });
    }
    const settings: DashboardSettings = {
      executionStatusSplit: body.executionStatusSplit,
      rawStateValues: body.rawStateValues,
      showManualAborts: body.showManualAborts,
      poolSystems: body.poolSystems,
      weeklyReport: body.weeklyReport,
      weeklyReportUpdate: body.weeklyReportUpdate === true,
      weeklyReportEmail: body.weeklyReportEmail === true,
      weeklyReportSections: weeklyReportSections as WeeklyReportSectionSettings,
      weeklyReportMode: body.weeklyReportMode,
      executionTime: body.executionTime,
      ngaiTestRunData: body.ngaiTestRunData,
    };
    await saveDashboardSettings(settings);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save dashboard settings." }, { status: 500 });
  }
}

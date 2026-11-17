import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings } from "@/lib/weekly-report-settings";
import { fetchHsdesIssueData } from "@/lib/hsdes-sightings";
import { fetchWeeklyReportHsdDetails, generateCompleteWeeklyReport } from "@/lib/weekly-report-service";
import { getISTDateKey, getISTDayRange } from "@/lib/work-weeks";
import { getWeeklyReportCycle } from "@/lib/weekly-report-cycles";
import { isSavedReportKey, makeCycleReportKey, saveDailyReport, saveWeeklyReportHsdDetails } from "@/lib/saved-weekly-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const params = new URL(req.url).searchParams;
    const hsdIds = params.getAll("hsdId");
    if (hsdIds.length) {
      const reportKey = params.get("reportKey");
      const generatedAt = params.get("generatedAt");
      if (hsdIds.length > 25 || hsdIds.some((id) => !/^\d{10,}$/.test(id))
        || (reportKey !== null && (!isSavedReportKey(reportKey) || !generatedAt || !Number.isFinite(Date.parse(generatedAt))))) {
        return NextResponse.json({ error: "Select valid HSD IDs and a saved report version." }, { status: 400 });
      }
      const details = await fetchWeeklyReportHsdDetails(hsdIds);
      if (reportKey && generatedAt) await saveWeeklyReportHsdDetails(reportKey, generatedAt, details);
      return NextResponse.json(details);
    }
    const reportSettings = await getWeeklyReportSettings();
    return NextResponse.json(await fetchHsdesIssueData(reportSettings.hsdesLink));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load HSDES issue details." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { mode?: unknown; cycleId?: unknown };
    if (body.mode !== "currentDayPreview") {
      return NextResponse.json({ error: "Only a current-day report preview can be generated manually." }, { status: 400 });
    }
    const cycleId = typeof body.cycleId === "string" ? body.cycleId : "b2";
    const cycle = await getWeeklyReportCycle(cycleId);
    if (!cycle) return NextResponse.json({ error: "Select an available execution cycle." }, { status: 400 });
    const today = getISTDateKey();
    const { from } = getISTDayRange(today);
    const now = new Date();
    const to = now > from ? now : new Date(from.getTime() + 60_000);
    const report = {
      ...await generateCompleteWeeklyReport(cycle.suiteNames, from, to, { id: cycle.id, name: cycle.name }),
      isCurrentDaySnapshot: true,
    };
    await saveDailyReport(makeCycleReportKey(today, cycle.id), report);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the current-day report." }, { status: 502 });
  }
}

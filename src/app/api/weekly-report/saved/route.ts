import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { isDailyReportDate, isSavedReportKey, listSavedReportKeys, loadSavedWeeklyReport, makeCycleReportKey, parseCycleReportKey, withFailureProgress } from "@/lib/saved-weekly-reports";
import { getISTDateKey } from "@/lib/work-weeks";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { listWeeklyReportCycles } from "@/lib/weekly-report-cycles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const key = new URL(req.url).searchParams.get("key");
    if (key === null) {
      const today = getISTDateKey();
      const params = new URL(req.url).searchParams;
      const requestedCycleId = params.get("cycleId") ?? "b2";
      const [reportKeys, settings, cycles] = await Promise.all([listSavedReportKeys(), getDashboardSettings(), listWeeklyReportCycles()]);
      const cycle = cycles.find((item) => item.id === requestedCycleId);
      if (!cycle) return NextResponse.json({ error: "Select an available execution cycle." }, { status: 400 });
      const savedReports = reportKeys.filter((reportKey) => {
        const cycleKey = parseCycleReportKey(reportKey);
        if (cycleKey) return cycleKey.cycleId === cycle.id;
        return cycle.id === "b2" && (isDailyReportDate(reportKey) || /^\d{4}-WW\d{2}$/.test(reportKey));
      });
      const todayKey = makeCycleReportKey(today, cycle.id);
      const reports = [todayKey, ...savedReports.filter((reportKey) => reportKey !== todayKey)];
      return NextResponse.json({ reports, savedReports, today: todayKey, todayDate: today, cycleId: cycle.id, cycles, sectionVisibility: settings.weeklyReportSections });
    }
    if (!isSavedReportKey(key)) return NextResponse.json({ error: "Select a valid saved report." }, { status: 400 });
    const report = await loadSavedWeeklyReport(key);
    if (!report) return NextResponse.json({ error: `No report has been saved for ${key}.` }, { status: 404 });
    const settings = await getDashboardSettings();
    return NextResponse.json({ report: { ...await withFailureProgress(report), sectionVisibility: settings.weeklyReportSections } });
  } catch {
    return NextResponse.json({ error: "Could not load saved Weekly Reports." }, { status: 500 });
  }
}
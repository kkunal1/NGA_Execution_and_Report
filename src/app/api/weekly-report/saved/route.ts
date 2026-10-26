import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { isDailyReportDate, isSavedReportKey, listSavedReportKeys, loadSavedWeeklyReport } from "@/lib/saved-weekly-reports";
import { getISTDateKey } from "@/lib/work-weeks";
import { getDashboardSettings } from "@/lib/dashboard-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const key = new URL(req.url).searchParams.get("key");
    if (key === null) {
      const today = getISTDateKey();
      const [reportKeys, settings] = await Promise.all([listSavedReportKeys(), getDashboardSettings()]);
      const savedReports = reportKeys.filter(isDailyReportDate);
      const reports = [today, ...savedReports.filter((date) => date !== today)];
      return NextResponse.json({ reports, savedReports, today, sectionVisibility: settings.weeklyReportSections });
    }
    if (!isSavedReportKey(key)) return NextResponse.json({ error: "Select a valid saved report." }, { status: 400 });
    const report = await loadSavedWeeklyReport(key);
    if (!report) return NextResponse.json({ error: `No report has been saved for ${key}.` }, { status: 404 });
    const settings = await getDashboardSettings();
    return NextResponse.json({ report: { ...report, sectionVisibility: settings.weeklyReportSections } });
  } catch {
    return NextResponse.json({ error: "Could not load saved Weekly Reports." }, { status: 500 });
  }
}
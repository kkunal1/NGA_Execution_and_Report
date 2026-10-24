import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getWeeklyReportSettings } from "@/lib/weekly-report-settings";
import { fetchHsdesArticleTitles, fetchHsdesIssueData } from "@/lib/hsdes-sightings";
import { B0_SUITES } from "@/lib/pool-systems";
import { generateCompleteWeeklyReport } from "@/lib/weekly-report-service";
import { getISTDateKey, getISTDayRange } from "@/lib/work-weeks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const reportSettings = await getWeeklyReportSettings();
    const hsdIds = new URL(req.url).searchParams.getAll("hsdId");
    if (hsdIds.length) {
      return NextResponse.json({ hsdFailureTitles: await fetchHsdesArticleTitles(hsdIds) });
    }
    return NextResponse.json(await fetchHsdesIssueData(reportSettings.hsdesLink));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load HSDES issue details." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { mode?: unknown };
    if (body.mode !== "currentDayPreview") {
      return NextResponse.json({ error: "Only a current-day report preview can be generated manually." }, { status: 400 });
    }
    const today = getISTDateKey();
    const { from } = getISTDayRange(today);
    const now = new Date();
    const to = now > from ? now : new Date(from.getTime() + 60_000);
    const report = await generateCompleteWeeklyReport([B0_SUITES.P1, B0_SUITES.P2], from, to);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the current-day report." }, { status: 502 });
  }
}

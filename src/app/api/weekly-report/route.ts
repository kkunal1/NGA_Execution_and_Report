import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getWeeklyReportSettings } from "@/lib/weekly-report-settings";
import { canonicalizeSightingDomain, fetchHsdesSightingCounts } from "@/lib/hsdes-sightings";
import { B0_SUITES } from "@/lib/pool-systems";
import { generateWeeklyReport } from "@/lib/weekly-report";
import { getWorkWeeks } from "@/lib/work-weeks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { mode?: unknown; from?: unknown; to?: unknown; week?: unknown; suites?: unknown };
    const { weeklyReportMode } = await getDashboardSettings();
    if (body.mode !== weeklyReportMode) {
      return NextResponse.json({ error: "Weekly Report mode changed. Reload the page." }, { status: 409 });
    }
    let from: Date;
    let to: Date;
    if (weeklyReportMode === "workWeek") {
      const week = getWorkWeeks().weeks.find((option) => option.label === body.week);
      if (!week) return NextResponse.json({ error: "Select an available work week." }, { status: 400 });
      ({ from, to } = week);
    } else {
      if (typeof body.from !== "string" || typeof body.to !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.from) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\.\d{3}Z$/.test(body.to)) {
        return NextResponse.json({ error: "Select a valid date range." }, { status: 400 });
      }
      from = new Date(body.from);
      to = new Date(body.to);
    }
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "The end of the range must follow its start." }, { status: 400 });
    }
    const suites = body.suites == null
      ? [B0_SUITES.P1, B0_SUITES.P2]
      : Array.isArray(body.suites) && body.suites.every((value) => typeof value === "string")
        ? [...new Set((body.suites as string[]).map((value) => value.trim()).filter(Boolean))]
        : [];
    if (!suites.length || suites.length > 5 || suites.some((suite) => suite.length > 250)) {
      return NextResponse.json({ error: "Choose between one and five suite names." }, { status: 400 });
    }
    const reportSettings = await getWeeklyReportSettings();
    const [report, sightingResult] = await Promise.all([
      generateWeeklyReport(suites, from, to, reportSettings.bkc, reportSettings.teamPlatformCounts),
      fetchHsdesSightingCounts(reportSettings.hsdesLink)
        .then((countsByDomain) => ({ countsByDomain, warning: "" }))
        .catch((error: unknown) => ({
          countsByDomain: null,
          warning: error instanceof Error ? error.message : "Could not load HSDES sightings through Kerberos.",
        })),
    ]);
    const backlogFailures = sightingResult.countsByDomain
      ? report.backlogFailures.map((row) => ({
          ...row,
          attached: sightingResult.countsByDomain?.[canonicalizeSightingDomain(row.group) ?? ""] ?? 0,
        }))
      : report.backlogFailures;
    return NextResponse.json({ ...report, backlogFailures, sightingWarning: sightingResult.warning });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the report." }, { status: 502 });
  }
}
import { canonicalizeSightingDomain, fetchHsdesArticleTitles, fetchHsdesIssueData } from "./hsdes-sightings";
import { generateWeeklyReport } from "./weekly-report";
import { getWeeklyReportSettings } from "./weekly-report-settings";
import { getDashboardSettings } from "./dashboard-settings";

export async function generateCompleteWeeklyReport(suites: string[], from: Date, to: Date) {
  const [settings, dashboardSettings] = await Promise.all([getWeeklyReportSettings(), getDashboardSettings()]);
  const sectionVisibility = dashboardSettings.weeklyReportSections;
  const [report, sightingResult] = await Promise.all([
    generateWeeklyReport(suites, from, to, settings.bkc, settings.teamPlatformCounts, settings.links, settings.cpuColumns, settings.cpuBreakdownTitle, settings.cpuBaseLabels),
    fetchHsdesIssueData(settings.hsdesLink)
      .then((issueData) => ({ ...issueData, warning: "" }))
      .catch((error: unknown) => ({
        countsByDomain: null,
        issues: [],
        agedIssues: [],
        warning: error instanceof Error ? error.message : "Could not load HSDES IDs through Kerberos.",
      })),
  ]);
  const backlogFailures = !sectionVisibility.overallFailureBreakdown
    ? []
    : sightingResult.countsByDomain
    ? report.backlogFailures.map((row) => ({
        ...row,
        attached: sightingResult.countsByDomain?.[canonicalizeSightingDomain(row.group) ?? ""] ?? 0,
      }))
    : report.backlogFailures;
  const hsdFailureSummaries = sectionVisibility.hsdFailureSummary ? report.hsdFailureSummaries : [];
  const hsdIds = hsdFailureSummaries.filter((summary) => summary.failedRuns >= 6).map((summary) => summary.hsdId);
  const hsdFailureTitles = sectionVisibility.hsdFailureSummary ? await fetchHsdesArticleTitles(hsdIds) : {};
  return {
    ...report,
    sectionVisibility,
    teamPlatformCounts: sectionVisibility.cpuAllocation ? report.teamPlatformCounts : [],
    cpuColumns: sectionVisibility.cpuAllocation ? report.cpuColumns : [],
    domainSummary: sectionVisibility.domainWise ? report.domainSummary : [],
    backlogFailures,
    hsdFailureSummaries,
    hsdesIssues: sightingResult.issues,
    agedHsdesIssues: sightingResult.agedIssues,
    hsdFailureTitles,
    sightingWarning: sightingResult.warning,
  };
}

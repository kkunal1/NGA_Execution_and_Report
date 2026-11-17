import { canonicalizeSightingDomain, fetchHsdesArticleDetails, fetchHsdesIssueData } from "./hsdes-sightings";
import { generateWeeklyReport, type WeeklyReport } from "./weekly-report";
import { getWeeklyReportSettings } from "./weekly-report-settings";
import { getDashboardSettings } from "./dashboard-settings";
import { withFailureProgress } from "./saved-weekly-reports";
import { mergeWeeklyReportHsdDetails, missingWeeklyReportHsdIds, type WeeklyReportHsdDetails } from "./weekly-report-hsd-details";

export async function fetchWeeklyReportHsdDetails(ids: string[], fetchDetails = fetchHsdesArticleDetails) {
  const details: Required<WeeklyReportHsdDetails> = { hsdFailureTitles: {}, hsdFailureStatuses: {}, hsdFailureReportTypes: {}, hsdFailureDaysOpen: {} };
  const failedIds: string[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let index = 0; index < uniqueIds.length; index += 25) {
    const batch = uniqueIds.slice(index, index + 25);
    const results = await Promise.allSettled(batch.map((id) => fetchDetails([id])));
    results.forEach((result, resultIndex) => {
      const id = batch[resultIndex];
      const article = result.status === "fulfilled" ? result.value[id] : undefined;
      if (!article) { failedIds.push(id); return; }
      details.hsdFailureTitles[id] = article.title;
      details.hsdFailureStatuses[id] = article.status;
      details.hsdFailureReportTypes[id] = article.reportType;
      if (article.daysOpen !== null) details.hsdFailureDaysOpen[id] = article.daysOpen;
    });
  }
  return { ...details, failedIds };
}

export async function completeWeeklyReportHsdDetails(report: WeeklyReport, fetchDetails = fetchHsdesArticleDetails): Promise<WeeklyReport> {
  const missingIds = missingWeeklyReportHsdIds(report);
  const details = await fetchWeeklyReportHsdDetails(missingIds, fetchDetails);
  const merged = mergeWeeklyReportHsdDetails(report, details);
  return details.failedIds.length
    ? { ...merged, sightingWarning: [report.sightingWarning, `HSD details unavailable for: ${details.failedIds.join(", ")}`].filter(Boolean).join(" ") }
    : merged;
}

export async function generateCompleteWeeklyReport(suites: string[], from: Date, to: Date, cycle?: { id: string; name: string }) {
  const [settings, dashboardSettings] = await Promise.all([getWeeklyReportSettings(cycle?.id), getDashboardSettings()]);
  const sectionVisibility = dashboardSettings.weeklyReportSections;
  const [report, sightingResult] = await Promise.all([
    generateWeeklyReport(suites, from, to, settings.bkc, settings.teamPlatformCounts, settings.links, settings.cpuColumns, settings.cpuBreakdownTitle, settings.cpuBaseLabels, settings.executionSummaryText),
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
  return withFailureProgress(await completeWeeklyReportHsdDetails({
    ...report,
    ...(cycle ? { executionCycleId: cycle.id, executionCycleName: cycle.name } : {}),
    sectionVisibility,
    teamPlatformCounts: sectionVisibility.cpuAllocation ? report.teamPlatformCounts : [],
    cpuColumns: sectionVisibility.cpuAllocation ? report.cpuColumns : [],
    domainSummary: sectionVisibility.domainWise ? report.domainSummary : [],
    backlogFailures,
    hsdFailureSummaries,
    hsdesIssues: sightingResult.issues,
    agedHsdesIssues: sightingResult.agedIssues,
    sightingWarning: sightingResult.warning,
    cpuAllocationEnabled: settings.cpuAllocationEnabled,
    customTables: settings.customTables,
  }));
}

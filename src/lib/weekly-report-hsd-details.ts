import type { WeeklyReport } from "./weekly-report";
import { normalizeHsdesReportType } from "./hsdes-report-type";

export type WeeklyReportHsdDetails = Pick<WeeklyReport, "hsdFailureTitles" | "hsdFailureStatuses" | "hsdFailureReportTypes" | "hsdFailureDaysOpen">;

function detailText(value: string | undefined) {
  return value && !/^(?:unknown|not found|loading(?:\.{3}|\u2026)?)$/i.test(value.trim()) ? value : undefined;
}

export function mergeWeeklyReportHsdDetails(report: WeeklyReport, details: WeeklyReportHsdDetails): WeeklyReport {
  const titles = { ...report.hsdFailureTitles };
  const statuses = { ...report.hsdFailureStatuses };
  const reportTypes = { ...report.hsdFailureReportTypes };
  const daysOpen = { ...report.hsdFailureDaysOpen };
  const issues = new Map((report.hsdesIssues ?? []).map((issue) => [issue.id, issue]));
  for (const { hsdId } of report.hsdFailureSummaries ?? []) {
    const issue = issues.get(hsdId);
    const title = detailText(titles[hsdId]) ?? detailText(issue?.title) ?? detailText(details.hsdFailureTitles?.[hsdId]);
    const status = detailText(statuses[hsdId]) ?? detailText(issue?.status) ?? detailText(details.hsdFailureStatuses?.[hsdId]);
    const reportType = normalizeHsdesReportType(detailText(reportTypes[hsdId]), detailText(issue?.reportType), detailText(details.hsdFailureReportTypes?.[hsdId]));
    const days = daysOpen[hsdId] ?? issue?.daysOpen ?? details.hsdFailureDaysOpen?.[hsdId];
    if (title) titles[hsdId] = title;
    if (status) statuses[hsdId] = status;
    if (reportType !== "Unknown") reportTypes[hsdId] = reportType;
    if (typeof days === "number" && Number.isFinite(days) && days >= 0) daysOpen[hsdId] = days;
  }
  return { ...report, hsdFailureTitles: titles, hsdFailureStatuses: statuses, hsdFailureReportTypes: reportTypes, hsdFailureDaysOpen: daysOpen };
}

export function missingWeeklyReportHsdIds(report: WeeklyReport): string[] {
  const merged = mergeWeeklyReportHsdDetails(report, {});
  return [...new Set((report.hsdFailureSummaries ?? []).filter(({ hsdId }) =>
    !detailText(merged.hsdFailureTitles?.[hsdId]) || !detailText(merged.hsdFailureStatuses?.[hsdId])
    || normalizeHsdesReportType(merged.hsdFailureReportTypes?.[hsdId]) === "Unknown"
    || merged.hsdFailureDaysOpen?.[hsdId] == null).map(({ hsdId }) => hsdId))];
}
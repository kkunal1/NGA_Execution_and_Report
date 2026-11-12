import { getDailyReportLabel, getISTDateKey } from "./work-weeks";
import type { WeeklyReport } from "./weekly-report";

type FailureSnapshot = {
  to: string;
  generatedAt: string;
  suites: string[];
  domainSummary: { domain: string; failed: number }[];
};

export type FailureProgressWindow = { startDate: string; endDate: string };

export function getB2FailureProgressWindow(anchorStartDate: string, reportDate: string): FailureProgressWindow {
  const anchor = new Date(`${anchorStartDate}T12:00:00.000Z`);
  const report = new Date(`${reportDate}T12:00:00.000Z`);
  const mondayOffset = (date: Date) => (date.getUTCDay() + 6) % 7;
  const anchorMonday = anchor.getTime() - mondayOffset(anchor) * 86_400_000;
  const reportMonday = report.getTime() - mondayOffset(report) * 86_400_000;
  const block = Math.max(0, Math.floor((reportMonday - anchorMonday) / (14 * 86_400_000)));
  const windowMonday = anchorMonday + block * 14 * 86_400_000;
  const startDate = block === 0 ? anchorStartDate : new Date(windowMonday).toISOString().slice(0, 10);
  const endDate = new Date(windowMonday + 11 * 86_400_000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

export function buildFailureProgress(report: FailureSnapshot, history: { date: string; report: FailureSnapshot }[] = [], window?: FailureProgressWindow): NonNullable<WeeklyReport["failureProgress"]> {
  const endDate = getISTDateKey(new Date(Date.parse(report.to) - 1));
  const suiteKey = (suites: string[]) => [...new Set(suites.map((suite) => suite.trim().toLowerCase()))].sort().join("\n");
  const snapshots = new Map<string, FailureSnapshot>();
  for (const { date, report: snapshot } of history) {
    if (date >= endDate || suiteKey(snapshot.suites) !== suiteKey(report.suites) || !snapshot.domainSummary?.length) continue;
    snapshots.set(date, snapshot);
  }
  if (report.domainSummary?.length) snapshots.set(endDate, report);
  let dateKeys: string[];
  if (window) {
    dateKeys = [];
    const cursor = new Date(`${window.startDate}T12:00:00Z`);
    const limit = new Date(`${window.endDate}T12:00:00Z`);
    while (cursor <= limit) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) dateKeys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const endDay = new Date(`${endDate}T12:00:00Z`);
    const weekdayOffset = (endDay.getUTCDay() + 6) % 7;
    const previousMonday = endDay.getTime() - (weekdayOffset + 7) * 86_400_000;
    dateKeys = Array.from({ length: 10 }, (_, index) =>
      new Date(previousMonday + (index + Math.floor(index / 5) * 2) * 86_400_000).toISOString().slice(0, 10),
    );
  }
  const days = dateKeys.map((date) => {
    const snapshot = snapshots.get(date);
    return {
      date,
      label: getDailyReportLabel(date),
      total: snapshot ? snapshot.domainSummary.reduce((sum, row) => sum + row.failed, 0) : null,
    };
  });
  const domains = [...new Set([
    ...(report.domainSummary ?? []).map((row) => row.domain),
    ...days.flatMap((day) => snapshots.get(day.date)?.domainSummary.map((row) => row.domain) ?? []),
  ])];
  return {
    days,
    rows: domains.map((domain) => ({
      domain,
      counts: days.map((day) => snapshots.get(day.date)?.domainSummary.find((row) => row.domain === domain)?.failed ?? null),
    })),
  };
}

export function weeklyReportYetToAttemptCount(report: {
  latestYetToAttempt?: number;
  latestNotRun: number;
  latestRerunPendingRunning?: number;
}): number {
  return report.latestYetToAttempt ?? Math.max(
    0,
    report.latestNotRun - (report.latestRerunPendingRunning ?? 0),
  );
}

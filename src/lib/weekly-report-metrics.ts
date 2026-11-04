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

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startGraphMailScheduler }, { startDailyWeeklyReportScheduler }, { startServerNGAiRefreshScheduler }] = await Promise.all([
      import("./lib/graph-mail-scheduler"),
      import("./lib/daily-weekly-report-scheduler"),
      import("./lib/server-ngai-refresh-scheduler"),
    ]);
    startGraphMailScheduler();
    startDailyWeeklyReportScheduler();
    startServerNGAiRefreshScheduler();
  }
}

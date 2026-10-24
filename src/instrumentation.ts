export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startGraphMailScheduler }, { startDailyWeeklyReportScheduler }] = await Promise.all([
      import("./lib/graph-mail-scheduler"),
      import("./lib/daily-weekly-report-scheduler"),
    ]);
    startGraphMailScheduler();
    startDailyWeeklyReportScheduler();
  }
}

import { generateCompleteWeeklyReport } from "./weekly-report-service";
import { getISTDateKey, getISTDayRange } from "./work-weeks";
import { isDailyReportDate, listSavedReportKeys, loadSavedWeeklyReport, makeCycleReportKey, parseCycleReportKey, saveDailyReport } from "./saved-weekly-reports";
import { listWeeklyReportCycles } from "./weekly-report-cycles";
import { getDashboardSettings, isAutomaticDailyReportEnabled, markDailyReportSkippedThrough } from "./dashboard-settings";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const RUN_AFTER_MINUTES = 5;
const RETRY_DELAY_MS = 5 * 60_000;
const CHECK_INTERVAL_MS = 60_000;
let scheduler: ReturnType<typeof setInterval> | undefined;
let running = false;
let retryAt = 0;
let retryDate = "";

const defaultDependencies = { listSavedReportKeys, loadSavedWeeklyReport, listWeeklyReportCycles, generateCompleteWeeklyReport, saveDailyReport, getDashboardSettings, markDailyReportSkippedThrough };

function addDays(dateKey: string, days: number) {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export async function runDailyWeeklyReportCheck(now = new Date(), overrides: Partial<typeof defaultDependencies> = {}) {
  if (running) return;
  const dependencies = { ...defaultDependencies, ...overrides };
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  if (istNow.getUTCHours() * 60 + istNow.getUTCMinutes() < RUN_AFTER_MINUTES) return;

  running = true;
  const targetDate = addDays(getISTDateKey(now), -1);
  if (retryDate !== targetDate) {
    retryDate = targetDate;
    retryAt = 0;
  }
  try {
    if (Date.now() < retryAt) return;
    const [savedKeys, availableCycles, dashboardSettings] = await Promise.all([
      dependencies.listSavedReportKeys(),
      dependencies.listWeeklyReportCycles(),
      dependencies.getDashboardSettings(),
    ]);
    const cycles = [];
    for (const cycle of availableCycles) {
      if (isAutomaticDailyReportEnabled(dashboardSettings, cycle.id)) cycles.push(cycle);
      else await dependencies.markDailyReportSkippedThrough(cycle.id, targetDate);
    }
    let failed = false;
    for (const cycle of cycles) {
      const dailyKeys = new Map<string, string>();
      for (const key of savedKeys) {
        const cycleKey = parseCycleReportKey(key);
        const date = cycleKey?.periodKey ?? key;
        if (!isDailyReportDate(date) || date > targetDate) continue;
        if (cycleKey ? cycleKey.cycleId !== cycle.id : cycle.id !== "b2") continue;
        if (cycleKey || !dailyKeys.has(date)) dailyKeys.set(date, key);
      }
      const savedReports = await Promise.all([...dailyKeys].map(async ([date, key]) => ({ date, report: await dependencies.loadSavedWeeklyReport(key) })));
      const finalizedDates = savedReports.filter(({ report }) => report && report.isCurrentDaySnapshot !== true).map(({ date }) => date).sort();
      const pendingDates = new Set(savedReports.filter(({ report }) => !report || report.isCurrentDaySnapshot === true).map(({ date }) => date));
      const skippedThrough = dashboardSettings.dailyReportSkippedThroughByCycle[cycle.id];
      if (skippedThrough) for (const date of pendingDates) if (date <= skippedThrough) pendingDates.delete(date);
      const lastProcessedDate = [...finalizedDates, ...(skippedThrough ? [skippedThrough] : [])].sort().at(-1);
      let nextDate = lastProcessedDate ? addDays(lastProcessedDate, 1) : [...pendingDates].sort()[0] ?? targetDate;
      while (nextDate <= targetDate) {
        pendingDates.add(nextDate);
        nextDate = addDays(nextDate, 1);
      }
      for (const date of [...pendingDates].sort()) {
        try {
          const { from, to } = getISTDayRange(date);
          const report = await dependencies.generateCompleteWeeklyReport(cycle.suiteNames, from, to, { id: cycle.id, name: cycle.name });
          await dependencies.saveDailyReport(makeCycleReportKey(date, cycle.id), { ...report, isCurrentDaySnapshot: false });
          console.info(`Saved automatic Weekly Report for ${cycle.name} on ${date}.`);
        } catch (error) {
          failed = true;
          console.error(`Automatic Weekly Report failed for ${cycle.name} on ${date}:`, error instanceof Error ? error.message : error);
        }
      }
    }
    retryAt = failed ? Date.now() + RETRY_DELAY_MS : 0;
  } catch (error) {
    retryAt = Date.now() + RETRY_DELAY_MS;
    console.error("Automatic daily Weekly Report generation failed:", error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startDailyWeeklyReportScheduler() {
  if (process.env.NODE_ENV !== "production") return;
  if (scheduler) return;
  scheduler = setInterval(() => void runDailyWeeklyReportCheck(), CHECK_INTERVAL_MS);
  scheduler.unref?.();
  void runDailyWeeklyReportCheck();
}

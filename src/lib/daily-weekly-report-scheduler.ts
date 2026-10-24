import { B0_SUITES } from "./pool-systems";
import { generateCompleteWeeklyReport } from "./weekly-report-service";
import { getISTDateKey, getISTDayRange } from "./work-weeks";
import { isDailyReportDate, listSavedReportKeys, saveDailyReport } from "./saved-weekly-reports";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const RUN_AFTER_MINUTES = 5;
const RETRY_DELAY_MS = 5 * 60_000;
const CHECK_INTERVAL_MS = 60_000;
let scheduler: ReturnType<typeof setInterval> | undefined;
let running = false;
let retryAt = 0;
let retryDate = "";

function addDays(dateKey: string, days: number) {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export async function runDailyWeeklyReportCheck(now = new Date()) {
  if (running) return;
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
    const savedDates = (await listSavedReportKeys()).filter(isDailyReportDate).sort();
    if (savedDates.includes(targetDate)) return;

    let nextDate = savedDates.length ? addDays(savedDates[savedDates.length - 1], 1) : targetDate;
    while (nextDate <= targetDate) {
      const { from, to } = getISTDayRange(nextDate);
      const report = await generateCompleteWeeklyReport([B0_SUITES.P1, B0_SUITES.P2], from, to);
      await saveDailyReport(nextDate, report);
      console.info(`Saved automatic Weekly Report for ${nextDate}.`);
      nextDate = addDays(nextDate, 1);
    }
    retryAt = 0;
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

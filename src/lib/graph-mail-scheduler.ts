import {
  getGraphMailAttemptState,
  getGraphMailSettings,
  getLastGraphMailSentDate,
  markGraphMailAttempt,
  markGraphMailError,
  markGraphMailSent,
} from "./graph-mail-settings";
import { sendLatestGraphReport } from "./graph-mail";

const configuredPollMs = Number(process.env.GRAPH_MAIL_POLL_MS);
const POLL_MS = Number.isFinite(configuredPollMs) && configuredPollMs >= 1000 ? configuredPollMs : 30_000;
const RETRY_DELAY_MS = 5 * 60_000;
const MAX_ATTEMPTS_PER_DAY = 3;
let scheduler: ReturnType<typeof setInterval> | undefined;
let running = false;

function getLocalClock(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export async function runGraphMailScheduleCheck(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const settings = await getGraphMailSettings();
    if (!settings) return;
    const local = getLocalClock(settings.timeZone, now);
    if (local.time < settings.sendAt || await getLastGraphMailSentDate() === local.date) return;
    const attempts = await getGraphMailAttemptState();
    if (attempts.lastAttemptDate === local.date) {
      if ((attempts.attemptsToday ?? 0) >= MAX_ATTEMPTS_PER_DAY) return;
      if (attempts.lastAttemptAt && now.getTime() - attempts.lastAttemptAt < RETRY_DELAY_MS) return;
    }

    await markGraphMailAttempt(local.date);
    try {
      await sendLatestGraphReport(settings);
      await markGraphMailSent(now.toISOString(), local.date);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled Graph email failed.";
      await markGraphMailError(message);
      console.error("Scheduled Microsoft Graph email failed:", message);
    }
  } finally {
    running = false;
  }
}

export function startGraphMailScheduler() {
  if (scheduler) return;
  scheduler = setInterval(() => void runGraphMailScheduleCheck(), POLL_MS);
  scheduler.unref?.();
  void runGraphMailScheduleCheck();
}

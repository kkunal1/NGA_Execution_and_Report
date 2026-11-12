import { normalizeSuiteNames } from "./normalize";
import { getRefreshSettings, getRefreshStatus, markRefreshCompleted } from "./refresh-settings";
import { refreshNGAiData } from "./ngai-refresh-service";

const CHECK_INTERVAL_MS = 5_000;
let scheduler: ReturnType<typeof setInterval> | undefined;
let checking = false;

export async function runServerNGAiRefreshCheck(now = Date.now()) {
  if (checking) return;
  checking = true;
  try {
    const [settings, status] = await Promise.all([getRefreshSettings(), getRefreshStatus()]);
    if (settings.intervalSeconds === 0 || !status.nextRefreshAt || now < status.nextRefreshAt) return;

    const suites = normalizeSuiteNames([...settings.suitesByProfile.b0, ...settings.suitesByProfile.b2]);
    if (!suites.length) return;

    const result = await refreshNGAiData(suites, { persist: true, refreshAborted: true });
    console.info(`Automatic NGAi refresh completed for ${suites.length} suites (${result.rows.length} rows).`);
  } catch (error) {
    console.error("Automatic NGAi refresh failed:", error instanceof Error ? error.message : error);
    try {
      const settings = await getRefreshSettings();
      await markRefreshCompleted(settings.intervalSeconds);
    } catch (statusError) {
      console.error("Could not schedule the next NGAi refresh attempt:", statusError instanceof Error ? statusError.message : statusError);
    }
  } finally {
    checking = false;
  }
}

export function startServerNGAiRefreshScheduler() {
  if (process.env.NODE_ENV !== "production" || scheduler) return;
  scheduler = setInterval(() => void runServerNGAiRefreshCheck(), CHECK_INTERVAL_MS);
  scheduler.unref?.();
  void runServerNGAiRefreshCheck();
}
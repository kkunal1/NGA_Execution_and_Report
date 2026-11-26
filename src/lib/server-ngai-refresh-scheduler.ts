import { normalizeSuiteNames } from "./normalize";
import { getAutoRefreshSuites, getRefreshSettings, getRefreshStatus, isCycleAutoRefreshEnabled, markRefreshCompleted } from "./refresh-settings";
import { refreshNGAiData } from "./ngai-refresh-service";
import { listCustomExecutionTabs } from "./execution-tabs";

const CHECK_INTERVAL_MS = 5_000;
let scheduler: ReturnType<typeof setInterval> | undefined;
let checking = false;

export async function runServerNGAiRefreshCheck(now = Date.now()) {
  if (checking) return;
  checking = true;
  try {
    const [settings, status] = await Promise.all([getRefreshSettings(), getRefreshStatus()]);
    if (settings.intervalSeconds === 0 || !status.nextRefreshAt || now < status.nextRefreshAt) return;

    const suites = getAutoRefreshSuites(settings);
    const customTabs = (await listCustomExecutionTabs()).filter((tab) => tab.enabled && isCycleAutoRefreshEnabled(settings, tab.id));
    if (!suites.length && !customTabs.length) {
      await markRefreshCompleted(settings.intervalSeconds);
      return;
    }

    if (suites.length) {
      try {
        const result = await refreshNGAiData(suites, { persist: true, refreshAborted: true, markSchedule: false });
        console.info(`Automatic NGAi refresh completed for ${suites.length} built-in suites (${result.rows.length} rows).`);
      } catch (error) {
        console.error("Automatic B0/B2 NGAi refresh failed:", error instanceof Error ? error.message : error);
      }
    }
    for (const tab of customTabs) {
      try {
        const result = await refreshNGAiData(tab.suiteNames, { persist: true, refreshAborted: true, customTabId: tab.id, markSchedule: false });
        console.info(`Automatic NGAi refresh completed for custom tab ${tab.name} (${result.rows.length} rows).`);
      } catch (error) {
        console.error(`Automatic NGAi refresh failed for custom tab ${tab.name}:`, error instanceof Error ? error.message : error);
      }
    }
    await markRefreshCompleted(settings.intervalSeconds);
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
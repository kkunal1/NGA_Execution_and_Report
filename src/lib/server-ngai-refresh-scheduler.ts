import { getCycleRefreshSchedule, getRefreshSettings, getRefreshStatus, markRefreshCycleCompleted } from "./refresh-settings";
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
    const customTabs = (await listCustomExecutionTabs()).filter((tab) => tab.enabled);
    const cycles: { id: string; name: string; suiteNames: string[]; customTabId?: string }[] = [
      { id: "b0", name: "DMR AP1 PV B0 Execution", suiteNames: settings.suitesByProfile.b0 },
      { id: "b2", name: "DMR AP1 PV B2 Execution", suiteNames: settings.suitesByProfile.b2 },
      ...customTabs.map((tab) => ({ id: tab.id, name: tab.name, suiteNames: tab.suiteNames, customTabId: tab.id })),
    ];
    for (const cycle of cycles) {
      const schedule = getCycleRefreshSchedule(settings, status, cycle.id);
      if (schedule.intervalSeconds === 0 || !cycle.suiteNames.length) continue;
      if (schedule.nextRefreshAt == null) {
        await markRefreshCycleCompleted(settings, cycle.id, now);
        continue;
      }
      if (now < schedule.nextRefreshAt) continue;
      try {
        const result = await refreshNGAiData(cycle.suiteNames, { persist: true, refreshAborted: true, cycleId: cycle.id, customTabId: cycle.customTabId, markSchedule: false });
        console.info(`Automatic NGAi refresh completed for ${cycle.name} (${result.rows.length} rows).`);
      } catch (error) {
        console.error(`Automatic NGAi refresh failed for ${cycle.name}:`, error instanceof Error ? error.message : error);
      }
      await markRefreshCycleCompleted(await getRefreshSettings(), cycle.id);
    }
  } catch (error) {
    console.error("Automatic NGAi refresh failed:", error instanceof Error ? error.message : error);
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
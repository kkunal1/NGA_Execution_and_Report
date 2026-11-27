import { getLatestVersion, saveAbortedSnapshot, saveLatestIfChanged } from "./store";
import { getRefreshSettings, getRefreshStatus, markRefreshCompleted, markRefreshCycleCompleted, saveRefreshSuites } from "./refresh-settings";
import { loadAbortedTests, loadTestRunQuery } from "./test-run-data";
import { getCustomExecutionTab, getCustomExecutionTabVersion, saveCustomExecutionTabAborted, saveCustomExecutionTabRun, updateCustomExecutionTabSuites } from "./execution-tabs";
import { normalizeSuiteNames } from "./normalize";
import type { NetworkOverride } from "./proxy";
import type { RunResult } from "./types";

let refreshQueue = Promise.resolve();

export async function refreshNGAiData(
  suiteInput: string | string[] | undefined,
  options: { network?: NetworkOverride; persist?: boolean; rememberSuites?: boolean; refreshAborted?: boolean; customTabId?: string; cycleId?: string; markSchedule?: boolean } = {},
) {
  const previous = refreshQueue;
  let release!: () => void;
  refreshQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const customTab = options.customTabId ? await getCustomExecutionTab(options.customTabId) : null;
    if (options.customTabId && !customTab) throw new TypeError("Custom execution tab not found.");
    const suiteNames = normalizeSuiteNames(suiteInput ?? customTab?.suiteNames);
    if (customTab && suiteNames.length === 0) throw new TypeError("Add at least one suite to this execution tab.");
    const result = await loadTestRunQuery(suiteNames, options.network);
    let changed = false;
    let runId: string | null = null;
    let version = customTab ? await getCustomExecutionTabVersion(customTab.id) : await getLatestVersion();
    if (options.rememberSuites && customTab) {
      await updateCustomExecutionTabSuites(customTab.id, suiteNames);
      version = await getCustomExecutionTabVersion(customTab.id);
    }

    if (options.persist && result.rows.length > 0) {
      const run: RunResult = {
        meta: {
          runId: `ngai-${Date.now()}`,
          capturedAt: new Date().toISOString(),
          url: result.url,
          filter: { entity: "TestLine", field: "Suite", operator: "Equal", value: suiteNames.join("\n") },
          source: "network",
          stateColumn: "State",
          gridUnlocked: true,
          filterVerified: true,
          appliedCondition: ["TestLine", "Suite", "Equal"],
          reportedTotal: result.loaded,
          durationMs: 0,
          warnings: result.warnings,
          observedEndpoints: result.url ? [result.url] : [],
          sampleRecord: result.rows[0]?.raw ?? null,
        },
        rows: result.rows,
        summary: result.summary,
      };
      const saved = customTab
        ? await saveCustomExecutionTabRun(customTab.id, run)
        : await saveLatestIfChanged(run);
      changed = saved.changed;
      runId = saved.run.meta.runId;
      version = saved.version;
      if (options.rememberSuites) {
        if (!customTab) await saveRefreshSuites(suiteNames);
      }

      if (options.refreshAborted && changed) {
        try {
          const aborted = await loadAbortedTests(suiteNames, options.network);
          if (customTab) await saveCustomExecutionTabAborted(customTab.id, suiteNames, aborted.rows);
          else await saveAbortedSnapshot(suiteNames, aborted.rows);
        } catch (error) {
          console.error("Automatic NGAi aborted-test refresh failed:", error instanceof Error ? error.message : error);
        }
      }
    }

    const settings = await getRefreshSettings();
    const cycleId = options.cycleId ?? options.customTabId;
    const refreshStatus = options.markSchedule === false
      ? await getRefreshStatus()
      : cycleId
        ? await markRefreshCycleCompleted(settings, cycleId)
        : await markRefreshCompleted(settings.intervalSeconds);
    return { ...result, changed, runId, version, ...refreshStatus };
  } finally {
    release();
  }
}
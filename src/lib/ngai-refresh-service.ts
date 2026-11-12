import { getLatestVersion, saveAbortedSnapshot, saveLatestIfChanged } from "./store";
import { getRefreshSettings, markRefreshCompleted, saveRefreshSuites } from "./refresh-settings";
import { loadAbortedTests, loadTestRunQuery } from "./test-run-data";
import { normalizeSuiteNames } from "./normalize";
import type { NetworkOverride } from "./proxy";
import type { RunResult } from "./types";

let refreshInFlight = false;

export async function refreshNGAiData(
  suiteInput: string | string[] | undefined,
  options: { network?: NetworkOverride; persist?: boolean; rememberSuites?: boolean; refreshAborted?: boolean } = {},
) {
  if (refreshInFlight) throw new Error("An NGAi refresh is already in progress.");
  refreshInFlight = true;
  try {
    const suiteNames = normalizeSuiteNames(suiteInput);
    const result = await loadTestRunQuery(suiteNames, options.network);
    let changed = false;
    let runId: string | null = null;
    let version = await getLatestVersion();

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
      const saved = await saveLatestIfChanged(run);
      changed = saved.changed;
      runId = saved.run.meta.runId;
      version = saved.version;
      if (options.rememberSuites) await saveRefreshSuites(suiteNames);

      if (options.refreshAborted && changed) {
        try {
          const aborted = await loadAbortedTests(suiteNames, options.network);
          await saveAbortedSnapshot(suiteNames, aborted.rows);
        } catch (error) {
          console.error("Automatic NGAi aborted-test refresh failed:", error instanceof Error ? error.message : error);
        }
      }
    }

    const settings = await getRefreshSettings();
    const refreshStatus = await markRefreshCompleted(settings.intervalSeconds);
    return { ...result, changed, runId, version, ...refreshStatus };
  } finally {
    refreshInFlight = false;
  }
}
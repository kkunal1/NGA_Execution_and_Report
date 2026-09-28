import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { NGAiAuthError } from "@/lib/ngai-client";
import { loadTestRunQuery } from "@/lib/test-run-data";
import { getRefreshSettings, markRefreshCompleted } from "@/lib/refresh-settings";
import { getLatestVersion, saveLatestIfChanged } from "@/lib/store";
import type { NetworkOverride } from "@/lib/proxy";
import type { RunResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  let suiteName: string | string[] | undefined;
  let network: NetworkOverride | undefined;
  let persist = false;
  let automatic = false;
  try {
    const body = (await req.json()) as { suiteName?: string; suiteNames?: string[]; vpnConnected?: boolean; proxyUrl?: string; persist?: boolean; automatic?: boolean };
    suiteName = body?.suiteNames?.length ? body.suiteNames : body?.suiteName?.trim() || undefined;
    if (typeof body?.vpnConnected === "boolean") network = { vpnConnected: body.vpnConnected, proxyUrl: body.proxyUrl };
    persist = body?.persist === true;
    automatic = body?.automatic === true;
  } catch {
    /* no body */
  }
  try {
    const result = await loadTestRunQuery(suiteName, network);
    const refreshSettings = await getRefreshSettings();
    const refreshStatus = await markRefreshCompleted(refreshSettings.intervalSeconds);
    let changed = false;
    let runId: string | null = null;
    let version = await getLatestVersion();
    if (persist && result.rows.length > 0) {
      const suites = Array.isArray(suiteName) ? suiteName.join("\n") : suiteName ?? "";
      const run: RunResult = {
        meta: {
          runId: `ngai-${Date.now()}`,
          capturedAt: new Date().toISOString(),
          url: result.url,
          filter: { entity: "TestLine", field: "Suite", operator: "Equal", value: suites },
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
    }
    if (automatic) return NextResponse.json({ changed, runId, version, ...refreshStatus });
    return NextResponse.json({ ...result, changed, runId, version, ...refreshStatus });
  } catch (error) {
    const status = error instanceof NGAiAuthError ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TestRun query failed" },
      { status },
    );
  }
}

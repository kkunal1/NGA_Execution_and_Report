import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getCycleRefreshSchedule, getRefreshSettings, getRefreshStatus } from "@/lib/refresh-settings";
import { getLatestVersion, getLatestVersionForProfile, listRuns, loadLatest, loadLatestForProfile, loadRun, type ExecutionProfile } from "@/lib/store";
import { getCustomExecutionTab, getCustomExecutionTabVersion, loadCustomExecutionTabSnapshot } from "@/lib/execution-tabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const customTabId = params.get("customTabId");
  if (customTabId !== null) {
    const tab = await getCustomExecutionTab(customTabId);
    if (!tab) return NextResponse.json({ error: "Custom execution tab not found." }, { status: 404 });
    const [snapshot, version, refreshStatus, refreshSettings] = await Promise.all([
      loadCustomExecutionTabSnapshot(customTabId),
      getCustomExecutionTabVersion(customTabId),
      getRefreshStatus(),
      getRefreshSettings(),
    ]);
    const cycleSchedule = getCycleRefreshSchedule(refreshSettings, refreshStatus, customTabId);
    const runId = params.get("runId");
    const run = runId && snapshot?.run?.meta.runId !== runId ? null : snapshot?.run ?? null;
    const runs = snapshot?.run ? [snapshot.run.meta.runId] : [];
    if (params.get("checkOnly") === "1") return NextResponse.json({ version, tab, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
    if (params.get("latestOnly") === "1") return NextResponse.json({ run, runs, version, tab, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
    return NextResponse.json({ run, runs, version, tab, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
  }
  const requestedProfile = params.get("profile");
  const profile: ExecutionProfile | null = requestedProfile === "b0" || requestedProfile === "b2" ? requestedProfile : null;
  const version = profile ? await getLatestVersionForProfile(profile) : await getLatestVersion();
  const refreshStatus = await getRefreshStatus();
  const refreshSettings = await getRefreshSettings();
  const cycleSchedule = getCycleRefreshSchedule(refreshSettings, refreshStatus, profile ?? "b0");
  if (params.get("checkOnly") === "1") return NextResponse.json({ version, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
  if (params.get("latestOnly") === "1") return NextResponse.json({ run: profile ? await loadLatestForProfile(profile) : await loadLatest(), version, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
  const runId = params.get("runId");
  const run = runId ? await loadRun(runId) : profile ? await loadLatestForProfile(profile) : await loadLatest();
  return NextResponse.json({ run, runs: await listRuns(), version, ...refreshStatus, ...refreshSettings, ...cycleSchedule });
}

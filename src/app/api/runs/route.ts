import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getRefreshSettings, getRefreshStatus } from "@/lib/refresh-settings";
import { getLatestVersion, listRuns, loadLatest, loadRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const version = await getLatestVersion();
  const refreshStatus = await getRefreshStatus();
  const refreshSettings = await getRefreshSettings();
  if (params.get("checkOnly") === "1") return NextResponse.json({ version, ...refreshStatus, ...refreshSettings });
  if (params.get("latestOnly") === "1") return NextResponse.json({ run: await loadLatest(), version, ...refreshStatus, ...refreshSettings });
  const runId = params.get("runId");
  const run = runId ? await loadRun(runId) : await loadLatest();
  return NextResponse.json({ run, runs: await listRuns(), version, ...refreshStatus, ...refreshSettings });
}

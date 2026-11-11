import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getRefreshSettings, getRefreshStatus } from "@/lib/refresh-settings";
import { getLatestVersion, getLatestVersionForProfile, listRuns, loadLatest, loadLatestForProfile, loadRun, type ExecutionProfile } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const requestedProfile = params.get("profile");
  const profile: ExecutionProfile | null = requestedProfile === "b0" || requestedProfile === "b2" ? requestedProfile : null;
  const version = profile ? await getLatestVersionForProfile(profile) : await getLatestVersion();
  const refreshStatus = await getRefreshStatus();
  const refreshSettings = await getRefreshSettings();
  if (params.get("checkOnly") === "1") return NextResponse.json({ version, ...refreshStatus, ...refreshSettings });
  if (params.get("latestOnly") === "1") return NextResponse.json({ run: profile ? await loadLatestForProfile(profile) : await loadLatest(), version, ...refreshStatus, ...refreshSettings });
  const runId = params.get("runId");
  const run = runId ? await loadRun(runId) : profile ? await loadLatestForProfile(profile) : await loadLatest();
  return NextResponse.json({ run, runs: await listRuns(), version, ...refreshStatus, ...refreshSettings });
}

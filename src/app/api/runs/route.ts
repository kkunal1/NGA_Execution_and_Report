import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getLatestVersion, listRuns, loadLatest, loadRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const version = await getLatestVersion();
  if (params.get("checkOnly") === "1") return NextResponse.json({ version });
  if (params.get("latestOnly") === "1") return NextResponse.json({ run: await loadLatest(), version });
  const runId = params.get("runId");
  const run = runId ? await loadRun(runId) : await loadLatest();
  return NextResponse.json({ run, runs: await listRuns(), version });
}

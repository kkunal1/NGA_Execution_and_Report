import { NextResponse } from "next/server";
import { listRuns, loadLatest, loadRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId");
  const run = runId ? await loadRun(runId) : await loadLatest();
  return NextResponse.json({ run, runs: await listRuns() });
}

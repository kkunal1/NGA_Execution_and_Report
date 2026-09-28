import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { buildReportFilename, renderReportHtml } from "@/lib/report-html";
import { loadLatest, loadRun, saveReport } from "@/lib/store";
import { isThemeId } from "@/lib/theme";
import type { RunResult, TestRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const runId = params.get("runId");
  const download = params.get("download") === "1";

  const run = runId ? await loadRun(runId) : await loadLatest();
  if (!run) {
    return NextResponse.json(
      { error: "No run data yet. Capture execution progress first." },
      { status: 404 },
    );
  }

  const html = renderReportHtml(run);
  await saveReport(run.meta.runId, html);

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(download
        ? {
            "content-disposition": `attachment; filename="${buildReportFilename(run.meta.filter.value)}"`,
          }
        : {}),
    },
  });
}

// Renders/downloads a run's HTML report directly from client state, for runs (e.g. NGAi) that aren't persisted server-side.
export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  let run: RunResult | undefined;
  let abortedRows: TestRow[] = [];
  let abortRangeLabel = "";
  let theme: string | null = null;
  let latestExecutedRows: TestRow[] = [];
  let testRangeLabel = "";
  try {
    const body = (await req.json()) as {
      run?: RunResult;
      abortedRows?: TestRow[];
      abortRangeLabel?: string;
      theme?: string;
      latestExecutedRows?: TestRow[];
      testRangeLabel?: string;
    };
    run = body?.run;
    abortedRows = body?.abortedRows ?? [];
    abortRangeLabel = body?.abortRangeLabel ?? "";
    theme = body?.theme ?? null;
    latestExecutedRows = body?.latestExecutedRows ?? [];
    testRangeLabel = body?.testRangeLabel ?? "";
  } catch {
    /* no body */
  }
  if (!run) {
    return NextResponse.json({ error: "No run data provided." }, { status: 400 });
  }

  const html = renderReportHtml(run, abortedRows, abortRangeLabel, isThemeId(theme) ? theme : undefined, latestExecutedRows, testRangeLabel);
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${buildReportFilename(run.meta.filter.value)}"`,
    },
  });
}


import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import type { ExecutionTimeSummary } from "@/lib/execution-time";
import { buildExecutionTimeHtml, buildExecutionTimeXlsx, exportFileName } from "@/lib/execution-time-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const list = (value: unknown) => (Array.isArray(value) ? value : []);

function sanitizeSummaries(value: unknown): ExecutionTimeSummary[] {
  return list(value).map((raw) => {
    const summary = (raw ?? {}) as Record<string, unknown>;
    return {
      subsystemName: text(summary.subsystemName, "Unknown"),
      totalTestCount: count(summary.totalTestCount),
      includedTestCount: count(summary.includedTestCount),
      excludedTestCount: count(summary.excludedTestCount),
      totalSeconds: count(summary.totalSeconds),
      configurations: list(summary.configurations).map((rawConfig) => {
        const configuration = (rawConfig ?? {}) as Record<string, unknown>;
        return {
          configurationName: text(configuration.configurationName, "Unknown configuration"),
          totalTestCount: count(configuration.totalTestCount),
          includedTestCount: count(configuration.includedTestCount),
          excludedTestCount: count(configuration.excludedTestCount),
          totalSeconds: count(configuration.totalSeconds),
          tests: list(configuration.tests).map((rawTest) => {
            const test = (rawTest ?? {}) as Record<string, unknown>;
            return {
              testName: text(test.testName, "Unknown test"),
              state: text(test.state, "Unknown"),
              seconds: typeof test.seconds === "number" && Number.isFinite(test.seconds) && test.seconds >= 0 ? test.seconds : null,
            };
          }),
        };
      }),
    };
  });
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  let body: { format?: unknown; suiteName?: unknown; summaries?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid export request." }, { status: 400 });
  }

  const format = body.format;
  if (format !== "excel" && format !== "html") {
    return NextResponse.json({ error: "Choose Excel or HTML." }, { status: 400 });
  }
  const suiteName = text(body.suiteName).trim().slice(0, 300);
  const summaries = sanitizeSummaries(body.summaries);
  if (!suiteName || summaries.length === 0) {
    return NextResponse.json({ error: "Load execution time data before downloading." }, { status: 400 });
  }

  try {
    if (format === "excel") {
      const file = await buildExecutionTimeXlsx(suiteName, summaries);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${exportFileName(suiteName, "xlsx")}"`,
        },
      });
    }
    return new NextResponse(buildExecutionTimeHtml(suiteName, summaries), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(suiteName, "html")}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the download." }, { status: 500 });
  }
}

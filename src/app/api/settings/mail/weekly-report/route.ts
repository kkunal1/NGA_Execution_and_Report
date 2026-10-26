import { NextResponse } from "next/server";
import { sendWeeklySmtpReport } from "@/lib/smtp-mail";
import { authorizeWeeklyReportFeature } from "@/lib/weekly-report-access";
import type { WeeklyReport } from "@/lib/weekly-report";

export const runtime = "nodejs";
export const maxDuration = 60;

function isWeeklyReport(value: unknown): value is WeeklyReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  const numericFields = ["planned", "latestPassed", "latestFailed", "latestRerunPendingRunning", "blockedLines", "latestNotRun"];
  return typeof report.generatedAt === "string" && Number.isFinite(Date.parse(report.generatedAt)) &&
    typeof report.from === "string" && Number.isFinite(Date.parse(report.from)) &&
    typeof report.to === "string" && Number.isFinite(Date.parse(report.to)) &&
    Array.isArray(report.suites) && report.suites.length > 0 && report.suites.every((suite) => typeof suite === "string") &&
    numericFields.every((field) => typeof report[field] === "number" && Number.isFinite(report[field])) &&
    Array.isArray(report.backlogFailures);
}

export async function POST(req: Request) {
  const denied = await authorizeWeeklyReportFeature(req, "weeklyReportEmail");
  if (denied) return denied;

  try {
    const body = (await req.json()) as { report?: unknown; sender?: unknown; password?: unknown; recipient?: unknown };
    if (!isWeeklyReport(body.report)) {
      return NextResponse.json({ error: "Create or load a valid Weekly Report before sending." }, { status: 400 });
    }
    if (typeof body.password !== "string" || !body.password.trim()) {
      return NextResponse.json({ error: "Enter your SMTP password before sending." }, { status: 400 });
    }
    if (typeof body.sender !== "string") {
      return NextResponse.json({ error: "Enter a sender email address." }, { status: 400 });
    }
    if (typeof body.recipient !== "string") {
      return NextResponse.json({ error: "Enter a recipient email address." }, { status: 400 });
    }
    const result = await sendWeeklySmtpReport(body.sender, body.password, body.recipient, body.report);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weekly Report email failed." }, { status: 502 });
  }
}
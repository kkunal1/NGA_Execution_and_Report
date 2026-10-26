"use client";

import { useEffect, useState } from "react";
import { FileText, Send } from "lucide-react";
import { getDailyReportLabel, getISTDateKey } from "@/lib/work-weeks";

const WEEKLY_REPORT_STORAGE_KEY = "nga-weekly-report-current";

type WeeklyReportMailCache = {
  report: Record<string, unknown>;
  from: string;
  to: string;
  reportLabel: string;
  suites: string[];
  latestPassed: number;
  latestFailed: number;
  blockedLines: number;
  latestNotRun: number;
};

function readWeeklyReportMailCache(): WeeklyReportMailCache | null {
  try {
    const stored = window.sessionStorage.getItem(WEEKLY_REPORT_STORAGE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as { report?: unknown; generatedWeek?: unknown };
    if (typeof value.report !== "object" || value.report === null || Array.isArray(value.report)) return null;
    const report = value.report as Record<string, unknown>;
    if (typeof report.from !== "string" || !Number.isFinite(Date.parse(report.from)) ||
      typeof report.to !== "string" || !Number.isFinite(Date.parse(report.to)) ||
      !Array.isArray(report.suites) || !report.suites.every((suite) => typeof suite === "string") ||
      typeof report.latestPassed !== "number" || typeof report.latestFailed !== "number" ||
      typeof report.blockedLines !== "number" || typeof report.latestNotRun !== "number") return null;
    return {
      report,
      from: report.from,
      to: report.to,
      reportLabel: typeof value.generatedWeek === "string"
        ? value.generatedWeek
        : getDailyReportLabel(getISTDateKey(new Date(report.from))),
      suites: report.suites,
      latestPassed: report.latestPassed,
      latestFailed: report.latestFailed,
      blockedLines: report.blockedLines,
      latestNotRun: report.latestNotRun,
    };
  } catch {
    return null;
  }
}

export default function WeeklyReportMailPanel() {
  const [weeklyMailSummary, setWeeklyMailSummary] = useState<Omit<WeeklyReportMailCache, "report"> | null>(null);
  const [weeklyMailMessage, setWeeklyMailMessage] = useState("");
  const [weeklyMailError, setWeeklyMailError] = useState("");
  const [smtpRecipient, setSmtpRecipient] = useState("krishna.kunal@intel.com");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [mailBusy, setMailBusy] = useState(false);

  useEffect(() => {
    const cached = readWeeklyReportMailCache();
    setWeeklyMailSummary(cached ? {
      from: cached.from,
      to: cached.to,
      reportLabel: cached.reportLabel,
      suites: cached.suites,
      latestPassed: cached.latestPassed,
      latestFailed: cached.latestFailed,
      blockedLines: cached.blockedLines,
      latestNotRun: cached.latestNotRun,
    } : null);
  }, []);

  const sendWeeklyReportMail = async () => {
    setMailBusy(true);
    setWeeklyMailError("");
    setWeeklyMailMessage("");
    try {
      const cached = readWeeklyReportMailCache();
      if (!cached) throw new Error("Create or load a Weekly Report first, then return here to send it.");
      if (!smtpPassword.trim()) throw new Error("Enter your Intel mail password before sending.");
      const response = await fetch("/api/settings/mail/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: cached.report, password: smtpPassword, recipient: smtpRecipient }),
      });
      const data = (await response.json()) as { error?: string; sentTo?: string; filename?: string };
      if (!response.ok) throw new Error(data.error || "Weekly Report email failed.");
      setSmtpPassword("");
      setWeeklyMailMessage(`Weekly Report sent to ${data.sentTo}. Attachment: ${data.filename}`);
    } catch (error) {
      setWeeklyMailError(error instanceof Error ? error.message : "Weekly Report email failed.");
    } finally {
      setMailBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-labelledby="weekly-mail-heading">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
        <h1 id="weekly-mail-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Mail settings</h1>
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Send your current Weekly Report using your Intel SMTP account. The password is used only for this send and is not saved by the app.</p>
      <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-[var(--text)]">
          Recipient
          <input type="email" value={smtpRecipient} onChange={(event) => setSmtpRecipient(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" autoComplete="email" />
        </label>
        <label className="block text-sm font-medium text-[var(--text)]">
          Intel mail password
          <input type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} placeholder="Enter password to send" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" autoComplete="off" />
        </label>
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">Sender: krishna.kunal@intel.com · Secure SMTP with TLS</p>
      {weeklyMailSummary ? (
        <p className="mt-3 text-sm text-[var(--text)]">
          Report ready for {weeklyMailSummary.reportLabel} · {weeklyMailSummary.suites.length} suites · {weeklyMailSummary.latestPassed} passed · {weeklyMailSummary.latestFailed} failed · {weeklyMailSummary.blockedLines} blocked · {weeklyMailSummary.latestNotRun} not run
        </p>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-muted)]" role="status">Create or load a Weekly Report first.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => void sendWeeklyReportMail()} disabled={mailBusy || !weeklyMailSummary || !smtpPassword.trim() || !smtpRecipient.trim()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden="true" />{mailBusy ? "Sending…" : "Send Weekly Report"}
        </button>
        {weeklyMailError && <p className="text-sm text-red-600" role="alert">{weeklyMailError}</p>}
        {weeklyMailMessage && <p className="text-sm text-emerald-700" role="status" aria-live="polite">{weeklyMailMessage}</p>}
      </div>
    </section>
  );
}

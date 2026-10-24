import { createTransport } from "nodemailer";
import type { WeeklyReport } from "./weekly-report";
import { renderWeeklyReportEmailHtml } from "./weekly-report-email";

const DEFAULT_SENDER = "krishna.kunal@intel.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendWeeklySmtpReport(password: string, recipient: string, report: WeeklyReport) {
  const sender = process.env.MAIL_SMTP_SENDER?.trim() || DEFAULT_SENDER;
  const host = process.env.MAIL_SMTP_HOST?.trim() || "SMTPAUTH.INTEL.COM";
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const to = recipient.trim();
  if (!password.trim()) throw new Error("Enter your SMTP password.");
  if (!EMAIL_PATTERN.test(to)) throw new Error("Enter a valid recipient email address.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MAIL_SMTP_PORT must be a valid port number.");

  const from = report.from.slice(0, 10);
  const toDate = report.to.slice(0, 10);
  const filename = `weekly-report-${from}-to-${toDate}.html`;
  const attempted = report.latestPassed + report.latestFailed + report.latestRerunPendingRunning;
  const transporter = createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: { user: sender, pass: password },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });

  try {
    const result = await transporter.sendMail({
      from: sender,
      to,
      subject: `Weekly Execution Report - ${from} to ${toDate}`,
      text: `Weekly Report for ${from} to ${toDate}. Suites: ${report.suites.join(", ")}. Attempted: ${attempted}; passed: ${report.latestPassed}; failed: ${report.latestFailed}. The formatted report is attached.`,
      attachments: [{
        filename,
        content: renderWeeklyReportEmailHtml(report),
        contentType: "text/html; charset=utf-8",
      }],
    });
    if (!result.accepted.length) throw new Error("The SMTP server did not accept the message for delivery.");
    return { sentTo: to, filename };
  } finally {
    transporter.close();
  }
}
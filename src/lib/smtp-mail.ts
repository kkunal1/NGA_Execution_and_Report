import { createTransport } from "nodemailer";
import type { WeeklyReport } from "./weekly-report";
import { renderWeeklyReportEmailHtml, weeklyReportEmailSubject } from "./weekly-report-email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_COPY_EMAIL = "krishna.kunal@intel.com";

export function parseEmailAddressList(value: string, fieldName: string, required = false): string[] {
  const addresses = value.split(",").map((address) => address.trim()).filter(Boolean);
  if (required && !addresses.length) throw new Error(`Enter at least one ${fieldName} email address.`);
  if (addresses.length > 50) throw new Error(`Enter no more than 50 ${fieldName} email addresses.`);
  const unique = new Map<string, string>();
  for (const address of addresses) {
    if (!EMAIL_PATTERN.test(address)) throw new Error(`Invalid ${fieldName} email address: ${address}`);
    if (!unique.has(address.toLowerCase())) unique.set(address.toLowerCase(), address);
  }
  return [...unique.values()];
}

export async function sendWeeklySmtpReport(senderEmail: string, password: string, recipientInput: string, ccInput: string, report: WeeklyReport) {
  const sender = senderEmail.trim();
  const host = process.env.MAIL_SMTP_HOST?.trim() || "SMTPAUTH.INTEL.COM";
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const recipients = parseEmailAddressList(recipientInput, "recipient", true);
  const recipientSet = new Set(recipients.map((address) => address.toLowerCase()));
  const cc = [...new Map([REPORT_COPY_EMAIL, ...parseEmailAddressList(ccInput, "CC")]
    .filter((address) => !recipientSet.has(address.toLowerCase()))
    .map((address) => [address.toLowerCase(), address])).values()];
  if (!EMAIL_PATTERN.test(sender)) throw new Error("Enter a valid sender email address.");
  if (!password.trim()) throw new Error("Enter your SMTP password.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MAIL_SMTP_PORT must be a valid port number.");

  const from = report.from.slice(0, 10);
  const toDate = report.to.slice(0, 10);
  const filename = `weekly-report-${from}-to-${toDate}.html`;
  const attempted = report.latestPassed + report.latestFailed + report.latestRerunPendingRunning;
  const reportHtml = renderWeeklyReportEmailHtml(report);
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
      to: recipients,
      cc,
      subject: weeklyReportEmailSubject(report),
      text: `Weekly Report for ${from} to ${toDate}. Recipients: ${recipients.join(", ")}. Suites: ${report.suites.join(", ")}. Attempted: ${attempted}; passed: ${report.latestPassed}; failed: ${report.latestFailed}. The formatted report is included below and attached.`,
      html: reportHtml,
      attachments: [{
        filename,
        content: reportHtml,
        contentType: "text/html; charset=utf-8",
      }],
    });
    if (!result.accepted.length) throw new Error("The SMTP server did not accept the message for delivery.");
    return { sentTo: recipients.join(", "), filename };
  } finally {
    transporter.close();
  }
}
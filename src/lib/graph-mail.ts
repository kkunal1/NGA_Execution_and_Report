import { request as undiciRequest } from "undici";
import { buildReportFilename, renderReportHtml } from "./report-html";
import { loadAbortedSnapshot, loadLatest } from "./store";
import { getSharedTheme } from "./app-theme";
import { normalizeSuiteNames } from "./normalize";
import type { TestRow } from "./types";
import type { GraphMailSettings } from "./graph-mail-settings";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

async function getAccessToken(settings: GraphMailSettings & { clientSecret: string }) {
  const authority = process.env.GRAPH_AUTHORITY_URL?.replace(/\/$/, "") ?? "https://login.microsoftonline.com";
  const tokenUrl = `${authority}/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await undiciRequest(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    headersTimeout: 20_000,
    bodyTimeout: 20_000,
  });
  const responseBody = await response.body.text();
  const result = JSON.parse(responseBody) as { access_token?: string; error_description?: string };
  if (response.statusCode < 200 || response.statusCode >= 300 || !result.access_token) {
    throw new Error(result.error_description || `Microsoft identity token request failed (${response.statusCode}).`);
  }
  return result.access_token;
}

export async function sendLatestGraphReport(
  settings: GraphMailSettings & { clientSecret: string },
  testMessage = false,
): Promise<{ sentTo: string; filename: string; runId: string }> {
  const run = await loadLatest();
  if (!run || run.meta.source !== "network") {
    throw new Error("No latest NGAi snapshot is available. Load the configured suites before sending mail.");
  }

  const suites = new Set(normalizeSuiteNames(run.meta.filter.value).map((suite) => suite.toLowerCase()));
  const abortedSnapshot = await loadAbortedSnapshot();
  const abortedRows: TestRow[] = (abortedSnapshot?.rows ?? []).filter((row) => suites.has(row.suite.toLowerCase()));
  const executedRows = run.rows.filter((row) => row.bucket === "Passed" || row.bucket === "Failed");
  const theme = await getSharedTheme() ?? "professional";
  const html = renderReportHtml(run, abortedRows, "", theme, executedRows, "");
  const filename = buildReportFilename(run.meta.filter.value);
  const sentAt = new Date().toLocaleString("en-US", { timeZone: settings.timeZone, dateStyle: "medium", timeStyle: "short" });
  const suiteList = normalizeSuiteNames(run.meta.filter.value).map(escapeHtml).join(", ");
  const messageHtml = `<p>${testMessage ? "This is a test email from NGA Portal." : "Your scheduled NGA execution report is attached."}</p><p><b>Suites:</b> ${suiteList}</p><p><b>Tests:</b> ${run.summary.tests} &nbsp; <b>Passed:</b> ${run.summary.passed} &nbsp; <b>Failed:</b> ${run.summary.failed} &nbsp; <b>Blocked:</b> ${run.summary.blocked}</p><p><b>Snapshot captured:</b> ${escapeHtml(sentAt)}</p>`;
  const accessToken = await getAccessToken(settings);
  const graphBase = process.env.GRAPH_API_BASE_URL?.replace(/\/$/, "") ?? "https://graph.microsoft.com/v1.0";
  const url = `${graphBase}/users/${encodeURIComponent(settings.senderEmail)}/sendMail`;
  const response = await undiciRequest(url, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: `${testMessage ? "[Test] " : ""}NGA execution report - ${sentAt}`,
        body: { contentType: "HTML", content: messageHtml },
        toRecipients: [{ emailAddress: { address: settings.recipientEmail } }],
        attachments: [{
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: filename,
          contentType: "text/html",
          contentBytes: Buffer.from(html, "utf8").toString("base64"),
        }],
      },
      saveToSentItems: true,
    }),
    headersTimeout: 20_000,
    bodyTimeout: 20_000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const errorText = (await response.body.text()).slice(0, 1000);
    throw new Error(`Microsoft Graph sendMail failed (${response.statusCode})${errorText ? `: ${errorText}` : ""}`);
  }
  await response.body.dump();
  return { sentTo: settings.recipientEmail, filename, runId: run.meta.runId };
}

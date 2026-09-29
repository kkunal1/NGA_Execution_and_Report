import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const MOCK_PORT = 4322;
const APP_PORT = 3124;
const SUITE = "Custom_QA_Suite_Not_The_Default";
const SECOND_SUITE = "Second_QA_Suite";
const records = [
  { testRunId: "run-1", udmTestId: "test-1", state: "Passed", testLineRevision: { testLineName: "line-a", testSuiteName: SUITE } },
  { testRunId: "run-2", udmTestId: "test-2", state: "Failed", testLineRevision: { testLineName: "line-a", testSuiteName: SUITE } },
  { testRunId: "run-3", udmTestId: "test-3", state: "Infra Error", testLineRevision: { testLineName: "line-b", testSuiteName: SUITE } },
  { testRunId: "run-4", udmTestId: "test-4", state: "Passed", testLineRevision: { testLineName: "line-c", testSuiteName: SECOND_SUITE } },
];
const abortedRecords = [
  { testRunId: "abort-1", state: "Aborted", testLineRevision: { testLineName: "line-a", testSuiteName: SUITE } },
  { testRunId: "abort-2", state: "Aborted", testLineRevision: { testLineName: "line-c", testSuiteName: SECOND_SUITE } },
];
let sentGraphMessage;
let graphMailSendCount = 0;

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  if (url.pathname.endsWith("/oauth2/v2.0/token")) {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const form = new URLSearchParams(body);
      const valid = form.get("client_id") === "graph-client-id" && form.get("client_secret") === "graph-client-secret";
      res.writeHead(valid ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(valid ? { access_token: "mock-graph-access-token" } : { error_description: "invalid client" }));
    });
    return;
  }
  if (url.pathname.endsWith("/sendMail")) {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body);
      const attachment = payload.message?.attachments?.[0];
      const valid = req.headers.authorization === "Bearer mock-graph-access-token" &&
        url.pathname.includes("reports%40intel.com") &&
        payload.message?.toRecipients?.[0]?.emailAddress?.address === "abcd@intel.com" &&
        attachment?.name?.endsWith(".html") &&
        attachment?.contentType === "text/html" &&
        Buffer.from(attachment?.contentBytes ?? "", "base64").toString("utf8").startsWith("<!doctype html>");
      if (valid) {
        sentGraphMessage = payload.message;
        graphMailSendCount += 1;
      }
      res.writeHead(valid ? 202 : 400, { "content-type": "application/json" });
      res.end(valid ? "" : JSON.stringify({ error: "Graph sendMail payload invalid" }));
    });
    return;
  }
  const filter = url.searchParams.get("$filter") ?? "";
  const skip = Number(url.searchParams.get("$skip") ?? "0");
  const isAbortedQuery = filter.includes("State eq 'Aborted'");
  const patPresent = req.headers["x-nga-pat"] === "test-token";
  const matchedSuite = [SUITE, SECOND_SUITE].find((suite) =>
    filter.includes(`tolower(TestLine/TestSuite/TestSuiteName) eq '${suite.toLowerCase()}'`) &&
    filter.includes(`tolower(TestLineRevision/TestSuite/testSuiteName) eq '${suite.toLowerCase()}'`),
  );
  const valid =
    patPresent &&
    !filter.includes("Beta_Cycle") &&
    !filter.includes("beta_regression_cycle") &&
    (isAbortedQuery || filter.includes("nonTriageLatestRunFlag eq true")) &&
    matchedSuite != null &&
    url.searchParams.get("$count") === "true" &&
    url.searchParams.get("$top") === "2" &&
    url.searchParams.get("$select")?.includes("State") === true &&
    url.searchParams.get("$expand")?.includes("TestLine") === true;
  const sourceRecords = isAbortedQuery ? abortedRecords : records;
  const suiteRecords = sourceRecords.filter((record) =>
    record.testLineRevision.testSuiteName.toLowerCase() === matchedSuite?.toLowerCase(),
  );
  const page = valid ? suiteRecords.slice(skip, skip + 2) : [];
  res.writeHead(valid ? 200 : 400, { "content-type": "application/json" });
  res.end(JSON.stringify(valid ? { "@odata.count": suiteRecords.length, value: page } : { error: "NGAi suite filter missing or incorrect" }));
});

const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
  env: {
    ...process.env,
    APP_ADMIN_USERNAME: "e2e-admin",
    APP_ADMIN_PASSWORD: "e2e-admin-password",
    NGAI_API_URL: `http://localhost:${MOCK_PORT}/Search/dmr_pv/odata/v1/TestRunComposite`,
    NGAI_API_TOKEN: "test-token",
    GRAPH_AUTHORITY_URL: `http://localhost:${MOCK_PORT}`,
    GRAPH_API_BASE_URL: `http://localhost:${MOCK_PORT}/v1.0`,
    GRAPH_MAIL_POLL_MS: "1000",
    NGAI_PAGE_SIZE: "2",
    NGA_DATA_DIR: ".e2e-ngai-data",
    NGA_BROWSER_CHANNEL: "channel-that-must-not-be-launched",
    NGA_PROFILE_DIR: ".e2e-ngai-profile",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let appLog = "";
let browser;
app.stdout.on("data", (data) => (appLog += data));
app.stderr.on("data", (data) => (appLog += data));

const waitForApp = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://localhost:${APP_PORT}/api/auth/session`);
      if (response.ok) return;
    } catch {
      // Wait for Next.js to become ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`app did not start:\n${appLog}`);
};

const cleanup = async () => {
  await browser?.close();
  app.stdout.destroy();
  app.stderr.destroy();
  app.kill();
  mock.closeAllConnections?.();
  await new Promise((resolve) => mock.close(resolve));
  await fs.rm(".e2e-ngai-data", { recursive: true, force: true });
};

try {
  await fs.rm(".e2e-ngai-data", { recursive: true, force: true });
  await new Promise((resolve) => mock.listen(MOCK_PORT, resolve));
  await waitForApp();
  const login = await fetch(`http://localhost:${APP_PORT}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "e2e-admin", password: "e2e-admin-password" }),
  });
  assert.equal(login.status, 200, "admin should be able to sign in");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "admin session cookie should be issued");
  const response = await fetch(`http://localhost:${APP_PORT}/api/test-run-data`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ suiteNames: [SUITE, SECOND_SUITE] }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.loaded, 4);
  assert.equal(result.summary.tests, 4);
  assert.equal(result.summary.passed, 2);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.blocked, 1);
  assert.deepEqual(result.rows.map((row) => row.suite), [SUITE, SUITE, SUITE, SECOND_SUITE]);
  assert.deepEqual(result.steps, { PreBoot: [], PostTest: [], Cleanup: [] });

  const abortedResponse = await fetch(`http://localhost:${APP_PORT}/api/aborted-tests`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ suiteNames: [SUITE, SECOND_SUITE] }),
  });
  const abortedResult = await abortedResponse.json();
  assert.equal(abortedResponse.status, 200, JSON.stringify(abortedResult));
  assert.equal(abortedResult.total, 2);
  const viewerLogin = await fetch(`http://localhost:${APP_PORT}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "root", password: "root" }),
  });
  const viewerCookie = viewerLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(viewerCookie, "viewer session cookie should be issued");
  const sharedAborted = await (await fetch(`http://localhost:${APP_PORT}/api/aborted-tests`, { headers: { cookie: viewerCookie } })).json();
  assert.equal(sharedAborted.rows.length, 2, "viewer receives server-persisted aborted rows");

  const refreshSettings = await fetch(`http://localhost:${APP_PORT}/api/settings/refresh`, { headers: { cookie } });
  assert.equal((await refreshSettings.json()).intervalSeconds, 60, "default refresh interval should be 60 seconds");
  const updateRefreshSettings = await fetch(`http://localhost:${APP_PORT}/api/settings/refresh`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intervalSeconds: 15 }),
  });
  assert.equal(updateRefreshSettings.status, 200, "admin can save refresh interval");
  const persistQuery = () => fetch(`http://localhost:${APP_PORT}/api/test-run-data`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ suiteNames: [SUITE, SECOND_SUITE], persist: true, automatic: true }),
  });
  const firstRefresh = await (await persistQuery()).json();
  assert.equal(firstRefresh.changed, true, "first automatic query should save a new snapshot");
  const unchangedRefresh = await (await persistQuery()).json();
  assert.equal(unchangedRefresh.changed, false, "unchanged rows should not rewrite the shared snapshot");
  const latest = await (await fetch(`http://localhost:${APP_PORT}/api/runs?latestOnly=1`, { headers: { cookie } })).json();
  assert.equal(latest.run.summary.tests, 4, "viewers can load the persisted shared snapshot");

  const mailConfig = await fetch(`http://localhost:${APP_PORT}/api/settings/mail`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      enabled: false,
      tenantId: "mock-tenant-id",
      clientId: "graph-client-id",
      senderEmail: "reports@intel.com",
      recipientEmail: "abcd@intel.com",
      sendAt: "09:00",
      timeZone: "UTC",
      clientSecret: "graph-client-secret",
    }),
  });
  assert.equal(mailConfig.status, 200, "admin can store encrypted Graph settings");
  const storedMailSettings = await fs.readFile(".e2e-ngai-data/graph-mail-settings.json", "utf8");
  assert.ok(!storedMailSettings.includes("graph-client-secret"), "client secret must be encrypted at rest");
  const mailTest = await fetch(`http://localhost:${APP_PORT}/api/settings/mail/test`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
  });
  assert.equal(mailTest.status, 200, await mailTest.text());
  assert.equal(sentGraphMessage?.toRecipients[0].emailAddress.address, "abcd@intel.com");
  assert.ok(sentGraphMessage?.attachments[0].name.endsWith(".html"), "Graph mail must attach the HTML report");
  const scheduledConfig = await fetch(`http://localhost:${APP_PORT}/api/settings/mail`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      enabled: true,
      tenantId: "mock-tenant-id",
      clientId: "graph-client-id",
      senderEmail: "reports@intel.com",
      recipientEmail: "abcd@intel.com",
      sendAt: "00:00",
      timeZone: "UTC",
      clientSecret: "",
    }),
  });
  assert.equal(scheduledConfig.status, 200, "saved encrypted secret should be reused when enabling the schedule");
  const scheduleDeadline = Date.now() + 15_000;
  let mailStatus = { lastSentAt: null };
  while (Date.now() < scheduleDeadline && !mailStatus.lastSentAt) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    mailStatus = await (await fetch(`http://localhost:${APP_PORT}/api/settings/mail`, { headers: { cookie } })).json();
  }
  assert.ok(mailStatus.lastSentAt, "background scheduler should send when its daily time is due");
  assert.ok(graphMailSendCount >= 2, "mock Graph should receive test and scheduled emails");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${APP_PORT}/`);
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const autoRefreshRequest = page.waitForRequest((request) => {
    if (new URL(request.url()).pathname !== "/api/test-run-data" || request.method() !== "POST") return false;
    try {
      return JSON.parse(request.postData() ?? "{}").automatic === true;
    } catch {
      return false;
    }
  }, { timeout: 25_000 });
  const automaticRequest = await autoRefreshRequest;
  assert.deepEqual(JSON.parse(automaticRequest.postData() ?? "{}").suiteNames, [SUITE, SECOND_SUITE]);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill("root");
  await page.getByLabel("Password").fill("root");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Aborted tests (2)" }).waitFor();

  console.log("NGAi E2E OK - authenticated per-suite queries, $skip pagination, merged results, no Chrome dependency");
  await cleanup();
} catch (error) {
  console.error("NGAi E2E FAILED:", error.message);
  console.error(appLog.slice(-2000));
  await cleanup();
  process.exitCode = 1;
}

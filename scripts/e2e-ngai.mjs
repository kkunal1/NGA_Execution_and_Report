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

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  const filter = url.searchParams.get("$filter") ?? "";
  const skip = Number(url.searchParams.get("$skip") ?? "0");
  const patPresent = req.headers["x-nga-pat"] === "test-token";
  const matchedSuite = [SUITE, SECOND_SUITE].find((suite) =>
    filter.includes(`tolower(TestLine/TestSuite/TestSuiteName) eq '${suite.toLowerCase()}'`) &&
    filter.includes(`tolower(TestLineRevision/TestSuite/testSuiteName) eq '${suite.toLowerCase()}'`),
  );
  const valid =
    patPresent &&
    !filter.includes("Beta_Cycle") &&
    !filter.includes("beta_regression_cycle") &&
    filter.includes("nonTriageLatestRunFlag eq true") &&
    matchedSuite != null &&
    url.searchParams.get("$count") === "true" &&
    url.searchParams.get("$top") === "2" &&
    url.searchParams.get("$select")?.includes("State") === true &&
    url.searchParams.get("$expand")?.includes("TestLine") === true;
  const suiteRecords = records.filter((record) =>
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

  console.log("NGAi E2E OK - authenticated per-suite queries, $skip pagination, merged results, no Chrome dependency");
  await cleanup();
} catch (error) {
  console.error("NGAi E2E FAILED:", error.message);
  console.error(appLog.slice(-2000));
  await cleanup();
  process.exitCode = 1;
}

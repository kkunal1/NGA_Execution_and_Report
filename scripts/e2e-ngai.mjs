import { spawn } from "node:child_process";
import http from "node:http";
import assert from "node:assert/strict";

const MOCK_PORT = 4322;
const APP_PORT = 3124;
const SUITE = "Custom_QA_Suite_Not_The_Default";
const records = [
  { testRunId: "run-1", udmTestId: "test-1", state: "Passed", testLineRevision: { testLineName: "line-a", testSuiteName: SUITE } },
  { testRunId: "run-2", udmTestId: "test-2", state: "Failed", testLineRevision: { testLineName: "line-a", testSuiteName: SUITE } },
  { testRunId: "run-3", udmTestId: "test-3", state: "Infra Error", testLineRevision: { testLineName: "line-b", testSuiteName: SUITE } },
];

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  const filter = url.searchParams.get("$filter") ?? "";
  const skip = Number(url.searchParams.get("$skip") ?? "0");
  const patPresent = req.headers["x-nga-pat"] === "test-token";
  const valid =
    patPresent &&
    !filter.includes("Beta_Cycle") &&
    !filter.includes("beta_regression_cycle") &&
    filter.includes("nonTriageLatestRunFlag eq true") &&
    filter.includes(`tolower(TestLine/TestSuite/TestSuiteName) eq '${SUITE.toLowerCase()}'`) &&
    filter.includes(`tolower(TestLineRevision/TestSuite/testSuiteName) eq '${SUITE.toLowerCase()}'`) &&
    url.searchParams.get("$count") === "true" &&
    url.searchParams.get("$top") === "2" &&
    url.searchParams.get("$select")?.includes("State") === true &&
    url.searchParams.get("$expand")?.includes("TestLine") === true;
  const page = valid ? records.slice(skip, skip + 2) : [];
  res.writeHead(valid ? 200 : 400, { "content-type": "application/json" });
  res.end(JSON.stringify(valid ? { "@odata.count": records.length, value: page } : { error: "NGAi suite filter missing or incorrect" }));
});

const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
  env: {
    ...process.env,
    NGAI_API_URL: `http://localhost:${MOCK_PORT}/Search/dmr_pv/odata/v1/TestRunComposite`,
    NGAI_API_TOKEN: "test-token",
    NGAI_PAGE_SIZE: "2",
    NGA_BROWSER_CHANNEL: "channel-that-must-not-be-launched",
    NGA_PROFILE_DIR: ".e2e-ngai-profile",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let appLog = "";
app.stdout.on("data", (data) => (appLog += data));
app.stderr.on("data", (data) => (appLog += data));

const waitForApp = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://localhost:${APP_PORT}/settings`);
      if (response.ok) return;
    } catch {
      // Wait for Next.js to become ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`app did not start:\n${appLog}`);
};

const cleanup = async () => {
  app.stdout.destroy();
  app.stderr.destroy();
  app.kill();
  mock.closeAllConnections?.();
  await new Promise((resolve) => mock.close(resolve));
};

try {
  await new Promise((resolve) => mock.listen(MOCK_PORT, resolve));
  await waitForApp();
  const response = await fetch(`http://localhost:${APP_PORT}/api/test-run-data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suiteName: SUITE }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.loaded, 3);
  assert.equal(result.summary.tests, 3);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.blocked, 1);
  assert.deepEqual(result.rows.map((row) => row.suite), [SUITE, SUITE, SUITE]);
  assert.deepEqual(result.steps, { PreBoot: [], PostTest: [], Cleanup: [] });
  console.log("NGAi E2E OK - direct suite query, $skip pagination across 2 pages, normalized results, no Chrome dependency");
  await cleanup();
} catch (error) {
  console.error("NGAi E2E FAILED:", error.message);
  console.error(appLog.slice(-2000));
  await cleanup();
  process.exitCode = 1;
}

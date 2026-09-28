// End-to-end test: serves a mock NGA Testlines page (frozen landing gate, "Condition"
// filter builder with a "GoalName" decoy, Search button, JSON API) and runs the real
// scraper against it through the app's own /api/scrape route.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const MOCK_PORT = 4321;
const APP_PORT = 3123;
const DATA_DIR = ".e2e-data";
const REPORTS_DIR = ".e2e-reports";
const SUITE = "Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle";
const SECOND_SUITE = "Second_QA_Suite";

const BASE_TESTS = [
  { Name: "boot_sanity", "Last Rerun State": "Passed" },
  { Name: "pcie_link", "Last Rerun State": "Passed" },
  { Name: "mem_train", "Last Rerun State": "Passed" },
  { Name: "thermal_soak", "Last Rerun State": "Failed" },
  { Name: "power_cycle", "Last Rerun State": "Infra Error" },
  { Name: "s3_resume", "Last Rerun State": "Not Run" },
];
const TESTS = BASE_TESTS.map((t) => ({ ...t, "Testline Name": SUITE }));
const SECOND_TESTS = BASE_TESTS.map((t) => ({ ...t, Name: `${t.Name}_second`, "Testline Name": SECOND_SUITE }));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>NGA Mock</title>
<style>
body{font:14px sans-serif;margin:20px}
#gate{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
#gate button{padding:12px 20px;font-size:16px}
#app{display:none}
.row{display:flex;gap:8px;margin:8px 0;align-items:center}
.cb{border:1px solid #888;padding:6px 10px;min-width:160px;cursor:pointer;background:#fff}
#panel{position:absolute;border:1px solid #888;background:#fff;z-index:99;max-height:220px;overflow:auto}
#panel [role=option]{padding:6px 10px;cursor:pointer}
</style></head><body>
<div id="gate"><button id="getLatest">Get Latest Testline</button></div>
<div id="app">
  <h3>Testlines</h3>
  <div class="row">
    <button id="clearAll">Clear All</button>
    <button id="addCond">Condition</button>
    <button id="search">Search</button>
    <select id="pageSize"><option>25</option><option>100</option><option>500</option><option>1000</option></select>
  </div>
  <div id="conditions"></div>
  <table id="grid"><thead><tr><th>Name</th><th>Testline Name</th><th>Last Rerun State</th></tr></thead><tbody></tbody></table>
</div>
<div id="panel" style="display:none" role="listbox"></div>
<script>
const OPTIONS = {
  Entity: ["Goal", "TestLine", "TestCase"],
  // "GoalName" deliberately precedes "Name" to catch substring matching.
  Field: ["GoalName", "Name", "Suite", "NameSpace", "Owner"],
  Operator: ["Not Equal", "Equal", "In", "Contains"]
};
const panel = document.getElementById('panel');
let active = null;

function openPanel(cb) {
  active = cb;
  const kind = cb.getAttribute('aria-label');
  render(OPTIONS[kind], '');
  const r = cb.getBoundingClientRect();
  panel.style.left = r.left + 'px';
  panel.style.top = (r.bottom + window.scrollY) + 'px';
  panel.style.display = 'block';
}
function render(list, q) {
  panel.innerHTML = '';
  list.filter(o => o.toLowerCase().includes(q.toLowerCase())).forEach(o => {
    const d = document.createElement('div');
    d.setAttribute('role', 'option');
    // Real widgets wrap options in icons + highlight markup, which breaks :text-is().
    const hit = q ? o.replace(new RegExp(q, 'i'), m => '<b>' + m + '</b>') : o;
    d.innerHTML = '\\n  <i class="material-icons" aria-hidden="true">check_box_outline_blank</i>\\n  <span class="lbl">' + hit + '</span>\\n  <span class="hint" aria-hidden="true">field</span>\\n';
    d.onclick = () => { active.textContent = o; panel.style.display = 'none'; active = null; };
    panel.appendChild(d);
  });
}
let typed = '';
document.addEventListener('keydown', e => {
  if (panel.style.display === 'none' || !active) return;
  if (e.key === 'Escape') { panel.style.display = 'none'; active = null; typed = ''; return; }
  if (e.key === 'Backspace' || e.key === 'Delete') typed = '';
  else if (e.key.length === 1) typed += e.key;
  render(OPTIONS[active.getAttribute('aria-label')], typed);
});

function addCondition() {
  const row = document.createElement('div');
  row.className = 'row cond';
  ['Entity', 'Field', 'Operator'].forEach(kind => {
    const cb = document.createElement('div');
    cb.className = 'cb';
    cb.setAttribute('role', 'combobox');
    cb.setAttribute('aria-label', kind);
    cb.tabIndex = 0;
    cb.textContent = '';
    cb.onclick = () => { typed = ''; openPanel(cb); };
    row.appendChild(cb);
  });
  const val = document.createElement('input');
  val.placeholder = 'Value';
  row.appendChild(val);
  document.getElementById('conditions').appendChild(row);
}

document.getElementById('getLatest').onclick = () => {
  document.getElementById('gate').remove();
  document.getElementById('app').style.display = 'block';
  // Landing state starts with a stale, pre-filled condition row.
  addCondition();
  const row = document.querySelector('.cond');
  row.children[0].textContent = 'Goal';
  row.children[1].textContent = 'GoalName';
  row.children[2].textContent = 'Contains';
  row.children[3].value = 'stale-value';
};
document.getElementById('clearAll').onclick = () => { document.getElementById('conditions').innerHTML = ''; };
document.getElementById('addCond').onclick = addCondition;

document.getElementById('search').onclick = async () => {
  const row = document.querySelector('.cond');
  if (!row) return;
  const [entity, field, operator] = [0, 1, 2].map(i => row.children[i].textContent.trim());
  const value = row.children[3].value.trim();
  const q = new URLSearchParams({ entity, field, operator, value });
  const res = await fetch('/api/testlines?' + q.toString());
  const data = await res.json();
  const body = document.querySelector('#grid tbody');
  body.innerHTML = '';
  data.items.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + r.Name + '</td><td>' + r['Testline Name'] + '</td><td>' + r['Last Rerun State'] + '</td>';
    body.appendChild(tr);
  });
};
</script></body></html>`;

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  if (url.pathname === "/api/testlines") {
    const p = url.searchParams;
    // Only the exact expected condition returns data.
    const suiteName = p.get("value");
    const items =
      p.get("entity") === "TestLine" &&
      p.get("field") === "Suite" &&
      p.get("operator") === "Equal" &&
      suiteName === SUITE ? TESTS :
      p.get("entity") === "TestLine" &&
      p.get("field") === "Suite" &&
      p.get("operator") === "Equal" &&
      suiteName === SECOND_SUITE ? SECOND_TESTS : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ total: items.length, items }));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)],
  {
    env: {
      ...process.env,
      APP_ADMIN_USERNAME: "e2e-admin",
      APP_ADMIN_PASSWORD: "e2e-admin-password",
      NGA_URL: `http://localhost:${MOCK_PORT}/`,
      NGA_HEADLESS: "true",
      NGA_BROWSER_CHANNEL: "chrome",
      NGA_PROFILE_DIR: ".e2e-profile",
      NGA_SETTLE_MS: "700",
      NGA_NAV_TIMEOUT_MS: "30000",
      NGA_SUITE_NAME: SUITE,
      NGA_DATA_DIR: DATA_DIR,
      NGA_REPORTS_DIR: REPORTS_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let appLog = "";
let browser;
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

const waitForApp = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${APP_PORT}/api/auth/session`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not start:\n${appLog}`);
};

const cleanup = async () => {
  await browser?.close();
  app.stdout.destroy();
  app.stderr.destroy();
  app.kill();
  mock.closeAllConnections?.();
  await new Promise((r) => mock.close(r));
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.rm(REPORTS_DIR, { recursive: true, force: true });
  await fs.rm(".e2e-profile", { recursive: true, force: true });
};

try {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  await waitForApp();
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/runs`)).status, 401, "run data must require sign-in");

  const adminLogin = await fetch(`http://localhost:${APP_PORT}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "e2e-admin", password: "e2e-admin-password" }),
  });
  assert.equal(adminLogin.status, 200, "admin should be able to sign in");
  const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(adminCookie, "admin session cookie should be issued");

  const res = await fetch(`http://localhost:${APP_PORT}/api/scrape`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ headless: true, suiteNames: [SUITE, SECOND_SUITE] }),
    signal: AbortSignal.timeout(300_000),
  });
  const run = await res.json();
  assert.ok(res.ok, `scrape failed: ${JSON.stringify(run)}`);

  console.log("condition read back:", run.meta.appliedCondition);
  console.log("warnings:", run.meta.warnings);

  assert.deepEqual(
    run.meta.appliedCondition,
    ["TestLine", "Suite", "Equal"],
    "filter row must be TestLine / Suite / Equal",
  );
  assert.equal(run.meta.filterVerified, true, "filter must verify");
  assert.equal(run.meta.gridUnlocked, true, "Get Latest Testline must be clicked");
  assert.equal(run.summary.tests, 12, "combined test count");
  assert.equal(run.summary.passed, 6, "combined passed");
  assert.equal(run.summary.failed, 2, "combined failed");
  assert.equal(run.summary.blocked, 2, "combined blocked (Infra Error)");
  assert.equal(run.summary.notRun, 2, "combined not run");
  assert.equal(run.summary.executed, 10, "combined executed");
  assert.equal(run.rows.some((row) => row.testline === SECOND_SUITE), true, "second suite rows must be merged");

  await fs.writeFile(`${DATA_DIR}/ngai-token.json`, "{}");
  const historyResponse = await fetch(`http://localhost:${APP_PORT}/api/runs`, { headers: { cookie: adminCookie } });
  const history = await historyResponse.json();
  assert.ok(history.runs.includes(run.meta.runId), "capture should appear in history");
  assert.ok(!history.runs.includes("ngai-token"), "encrypted token file must not appear in history");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let suiteQueryRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/test-run-data") suiteQueryRequests += 1;
  });
  await page.goto(`http://localhost:${APP_PORT}/`);
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator('fieldset[aria-label="Filter dashboard by loaded suite"]').waitFor();
  await page.evaluate(({ cachedRun, suites }) => {
    sessionStorage.setItem("nga-ngai-last-run", JSON.stringify({ suiteNames: suites, run: cachedRun }));
    sessionStorage.setItem("nga-suite-name-input", suites.join("\n"));
  }, { cachedRun: run, suites: [SUITE, SECOND_SUITE] });
  await page.reload();
  const suiteCheckboxes = page.locator('fieldset[aria-label="Filter dashboard by loaded suite"] input[type="checkbox"]');
  await suiteCheckboxes.first().waitFor();
  assert.equal(await suiteCheckboxes.count(), 2, "one checkbox should be shown for each loaded suite");
  const totalTests = page.getByText("Total tests", { exact: true });
  const readTotal = () => totalTests.evaluate((element) => element.nextElementSibling?.textContent?.trim());
  assert.equal(await readTotal(), "12", "all suites should be selected initially");
  await suiteCheckboxes.nth(1).uncheck();
  await page.waitForFunction(() => {
    const label = [...document.querySelectorAll("div")].find((element) => element.textContent?.trim() === "Total tests");
    return label?.nextElementSibling?.textContent?.trim() === "6";
  });
  await suiteCheckboxes.nth(1).check();
  await page.waitForFunction(() => {
    const label = [...document.querySelectorAll("div")].find((element) => element.textContent?.trim() === "Total tests");
    return label?.nextElementSibling?.textContent?.trim() === "12";
  });
  assert.equal(suiteQueryRequests, 0, "checkbox changes must not send another NGAi query");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const reportDownload = await downloadPromise;
  assert.ok(!/[\r\n]/.test(reportDownload.suggestedFilename()), "multi-suite report filename must be safe");

  const viewerLogin = await fetch(`http://localhost:${APP_PORT}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "root", password: "root" }),
  });
  const viewerResult = await viewerLogin.json();
  assert.equal(viewerResult.role, "viewer", "root/root must sign in as a viewer");
  const viewerCookie = viewerLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(viewerCookie, "viewer session cookie should be issued");
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/runs`, { headers: { cookie: viewerCookie } })).status, 200);
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/scrape`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: viewerCookie },
    body: JSON.stringify({ headless: true }),
  })).status, 403, "viewer must not start a scrape");
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/settings/ngai-token`, { headers: { cookie: viewerCookie } })).status, 403);
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/settings/refresh`, { headers: { cookie: viewerCookie } })).status, 403);
  assert.equal((await fetch(`http://localhost:${APP_PORT}/api/runs?checkOnly=1`, { headers: { cookie: viewerCookie } })).status, 200);
  assert.equal(await page.evaluate(async () => {
    const response = await fetch("/api/settings/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "blue" }),
    });
    return response.status;
  }), 200, "admin can set the shared theme");
  const refreshSetting = await fetch(`http://localhost:${APP_PORT}/api/settings/refresh`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ intervalSeconds: 15 }),
  });
  assert.equal(refreshSetting.status, 200, "admin can configure the refresh interval");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill("root");
  await page.getByLabel("Password").fill("root");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Read-only viewer", { exact: true }).waitFor();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "blue");
  await page.waitForFunction(() => document.querySelector('[role="timer"]')?.getAttribute("aria-label")?.startsWith("Next refresh in 00:"));
  assert.match(await page.getByRole("timer").getAttribute("aria-label"), /Next refresh in 00:/);
  assert.equal(await page.getByRole("button", { name: "Load NGAi data" }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Settings" }).count(), 0);
  const viewerDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const viewerDownload = await viewerDownloadPromise;
  assert.ok(viewerDownload.suggestedFilename().endsWith(".html"), "viewer can download the displayed report");

  const traversal = await fetch(
    `http://localhost:${APP_PORT}/api/runs?runId=..%2F..%2Fpackage`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal((await traversal.json()).run, null, "path traversal must be blocked");

  const report = await fetch(`http://localhost:${APP_PORT}/api/report`, { headers: { cookie: adminCookie } });
  const html = await report.text();
  assert.ok(report.ok && html.includes("Filter verified"), "HTML report must render");

  console.log("E2E OK - unlock, Condition, exact field select, Search, counts, report");
  await cleanup();
  process.exitCode = 0;
} catch (err) {
  console.error("E2E FAILED:", err.message);
  console.error(appLog.slice(-2000));
  await cleanup();
  process.exitCode = 1;
}

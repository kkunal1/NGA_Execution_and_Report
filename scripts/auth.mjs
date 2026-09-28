// One-time interactive sign-in: opens NGA in a real Chrome window using the
// persistent profile so later headless runs reuse the SSO session.
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const envFile = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url =
  process.env.NGA_URL ?? "https://nga.laas.intel.com/#/dmr_pv/planning/testlines";
const profileDir = path.resolve(
  process.cwd(),
  process.env.NGA_PROFILE_DIR ?? ".browser-profile",
);

const launch = (channel) =>
  chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    viewport: { width: 1680, height: 1000 },
    ignoreHTTPSErrors: true,
  });

let context;
try {
  context = await launch(process.env.NGA_BROWSER_CHANNEL ?? "chrome");
} catch {
  context = await launch(undefined);
}

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

console.log("\nComplete the Intel sign-in in the opened browser window.");
console.log("When the Testlines page is fully visible, come back here.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter once you are signed in... ");
rl.close();

await context.close();
console.log(`Session stored in ${profileDir}. Headless captures can now run.`);

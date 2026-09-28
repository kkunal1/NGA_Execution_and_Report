// Quick environment check: can Playwright launch the persistent browser profile?
import path from "node:path";
import { chromium } from "playwright";

const profileDir = path.resolve(
  process.cwd(),
  process.env.NGA_PROFILE_DIR ?? ".browser-profile",
);

for (const channel of [process.env.NGA_BROWSER_CHANNEL ?? "chrome", undefined]) {
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("about:blank");
    console.log(`OK - launched headless via "${channel ?? "bundled chromium"}"`);
    await context.close();
    process.exit(0);
  } catch (err) {
    console.log(
      `FAILED "${channel ?? "bundled chromium"}": ${String(err.message).split("\n")[0]}`,
    );
  }
}
process.exit(1);

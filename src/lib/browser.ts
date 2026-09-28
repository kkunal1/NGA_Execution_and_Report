import fs from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright";
import { config } from "./config";

export type Session = {
  context: BrowserContext;
  close: () => Promise<void>;
};

/**
 * Persistent context so the Intel SSO cookies/Kerberos session survive between runs.
 * Falls back to the bundled Chromium if the `chrome` channel is not installed.
 */
export async function openSession(
  overrides: { headless?: boolean } = {},
): Promise<Session> {
  await fs.mkdir(config.profileDir, { recursive: true });
  const headless = overrides.headless ?? config.headless;

  const launch = (channel?: string) =>
    chromium.launchPersistentContext(config.profileDir, {
      channel,
      headless,
      viewport: { width: 1680, height: 1000 },
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      args: ["--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"],
    });

  let context: BrowserContext;
  try {
    context = await launch(config.channel || undefined);
  } catch {
    context = await launch(undefined);
  }

  context.setDefaultTimeout(config.navTimeoutMs);
  context.setDefaultNavigationTimeout(config.navTimeoutMs);

  return {
    context,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

/** Heuristic: are we sitting on an SSO / login wall instead of the app? */
export function looksLikeLogin(url: string, title: string): boolean {
  const haystack = `${url} ${title}`.toLowerCase();
  return /login|signin|sign-in|sso|adfs|okta|auth\/|federation|microsoftonline/.test(
    haystack,
  );
}

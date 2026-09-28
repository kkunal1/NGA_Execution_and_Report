import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { AuthRequiredError, scrapeTestlines } from "@/lib/scrape";
import { saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  let headless: boolean | undefined;
  let suiteName: string | undefined;
  let suiteNames: string[] | undefined;
  try {
    const body = (await req.json()) as { headless?: boolean; suiteName?: string; suiteNames?: string[] };
    headless = body?.headless;
    suiteName = body?.suiteName;
    suiteNames = body?.suiteNames;
  } catch {
    /* no body */
  }

  try {
    const run = await scrapeTestlines({ headless, suiteName, suiteNames });
    await saveRun(run);
    return NextResponse.json(run);
  } catch (err) {
    const status = err instanceof AuthRequiredError ? 428 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scrape failed" },
      { status },
    );
  }
}

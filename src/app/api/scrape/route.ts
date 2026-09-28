import { NextResponse } from "next/server";
import { AuthRequiredError, scrapeTestlines } from "@/lib/scrape";
import { saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  let headless: boolean | undefined;
  let suiteName: string | undefined;
  try {
    const body = (await req.json()) as { headless?: boolean; suiteName?: string };
    headless = body?.headless;
    suiteName = body?.suiteName;
  } catch {
    /* no body */
  }

  try {
    const run = await scrapeTestlines({ headless, suiteName });
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

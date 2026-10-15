import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { isWorkWeekKey, listSavedWeeklyReports, loadSavedWeeklyReport } from "@/lib/saved-weekly-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  try {
    const key = new URL(req.url).searchParams.get("key");
    if (key === null) return NextResponse.json({ weeks: await listSavedWeeklyReports() });
    if (!isWorkWeekKey(key)) return NextResponse.json({ error: "Select a valid work week." }, { status: 400 });
    const report = await loadSavedWeeklyReport(key);
    if (!report) return NextResponse.json({ error: `No report has been saved for ${key}.` }, { status: 404 });
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "Could not load saved Weekly Reports." }, { status: 500 });
  }
}
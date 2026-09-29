import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getGraphMailSettings } from "@/lib/graph-mail-settings";
import { sendLatestGraphReport } from "@/lib/graph-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const settings = await getGraphMailSettings(false);
    if (!settings) return NextResponse.json({ error: "Save a client secret and mail settings before sending a test." }, { status: 400 });
    const result = await sendLatestGraphReport(settings, true);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Test email failed." }, { status: 502 });
  }
}
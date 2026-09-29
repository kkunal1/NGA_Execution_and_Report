import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { summarizeExecutionTime } from "@/lib/execution-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;

  let suiteName = "";
  try {
    const body = (await req.json()) as { suiteName?: unknown };
    if (typeof body.suiteName === "string") suiteName = body.suiteName.trim();
  } catch {
    return NextResponse.json({ error: "Enter a suite name." }, { status: 400 });
  }
  if (!suiteName) return NextResponse.json({ error: "Enter a suite name." }, { status: 400 });

  try {
    return NextResponse.json({ suiteName, summaries: await summarizeExecutionTime(suiteName) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not calculate execution time." },
      { status: 502 },
    );
  }
}

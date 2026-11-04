import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { loadLatest } from "@/lib/store";
import { inspectFailures, type FailureSearchResult } from "@/lib/failure-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DOMAINS = ["pv_security", "pv_power_management", "pv_memory", "pv_ras", "pv_reset", "pv_seamless", "pv_serial_io", "pv_virtualization", "pv_manageability"];

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const run = await loadLatest();
    const domains = [...new Set([...DEFAULT_DOMAINS, ...(run?.rows.map((row) => row.domain).filter((domain): domain is string => Boolean(domain)) ?? [])])];
    const domain = new URL(req.url).searchParams.get("domain") ?? "";
    if (domain && !domains.includes(domain)) return NextResponse.json({ error: "Select a valid domain." }, { status: 400 });
    if (domain && !run) return NextResponse.json({ error: "No saved execution data is available." }, { status: 404 });
    const result: FailureSearchResult = {
      capturedAt: run?.meta.capturedAt ?? null,
      checkedAt: domain ? new Date().toISOString() : null,
      domains,
      domain,
      rows: domain ? await inspectFailures(run!.rows.filter((row) => row.domain === domain && row.bucket === "Failed")) : [],
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load failure status." }, { status: 500 });
  }
}
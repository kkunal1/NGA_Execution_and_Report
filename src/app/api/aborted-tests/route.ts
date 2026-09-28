import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { NGAiAuthError } from "@/lib/ngai-client";
import { loadAbortedTests } from "@/lib/test-run-data";
import type { NetworkOverride } from "@/lib/proxy";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  let suiteName: string | string[] | undefined;
  let network: NetworkOverride | undefined;
  try {
    const body = (await req.json()) as { suiteName?: string; suiteNames?: string[]; vpnConnected?: boolean; proxyUrl?: string };
    suiteName = body?.suiteNames?.length ? body.suiteNames : body?.suiteName?.trim() || undefined;
    if (typeof body?.vpnConnected === "boolean") network = { vpnConnected: body.vpnConnected, proxyUrl: body.proxyUrl };
  } catch {
    /* no body */
  }
  try {
    return NextResponse.json(await loadAbortedTests(suiteName, network));
  } catch (error) {
    const status = error instanceof NGAiAuthError ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aborted tests query failed" },
      { status },
    );
  }
}

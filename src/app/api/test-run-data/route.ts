import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { NGAiAuthError } from "@/lib/ngai-client";
import { refreshNGAiData } from "@/lib/ngai-refresh-service";
import type { NetworkOverride } from "@/lib/proxy";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  let suiteName: string | string[] | undefined;
  let network: NetworkOverride | undefined;
  let persist = false;
  let automatic = false;
  try {
    const body = (await req.json()) as { suiteName?: string; suiteNames?: string[]; vpnConnected?: boolean; proxyUrl?: string; persist?: boolean; automatic?: boolean };
    suiteName = body?.suiteNames?.length ? body.suiteNames : body?.suiteName?.trim() || undefined;
    if (typeof body?.vpnConnected === "boolean") network = { vpnConnected: body.vpnConnected, proxyUrl: body.proxyUrl };
    persist = body?.persist === true;
    automatic = body?.automatic === true;
  } catch {
    /* no body */
  }
  try {
    const result = await refreshNGAiData(suiteName, {
      network,
      persist,
      rememberSuites: persist && !automatic,
      refreshAborted: automatic,
    });
    if (automatic) return NextResponse.json({ changed: result.changed, runId: result.runId, version: result.version, nextRefreshAt: result.nextRefreshAt });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof NGAiAuthError ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TestRun query failed" },
      { status },
    );
  }
}

import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { NGAiAuthError, NGAI_SUITE_NAME } from "@/lib/ngai-client";
import { loadAbortedTests } from "@/lib/test-run-data";
import { loadAbortedSnapshot, saveAbortedSnapshot } from "@/lib/store";
import { normalizeSuiteNames } from "@/lib/normalize";
import type { NetworkOverride } from "@/lib/proxy";
import { getCustomExecutionTab, loadCustomExecutionTabSnapshot, saveCustomExecutionTabAborted } from "@/lib/execution-tabs";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  const customTabId = new URL(req.url).searchParams.get("customTabId");
  if (customTabId !== null) {
    if (!await getCustomExecutionTab(customTabId)) return NextResponse.json({ error: "Custom execution tab not found." }, { status: 404 });
    const snapshot = await loadCustomExecutionTabSnapshot(customTabId);
    return NextResponse.json({
      rows: snapshot?.abortedRows ?? [],
      suiteNames: snapshot?.abortedSuiteNames ?? [],
      fetchedAt: snapshot?.abortedFetchedAt ?? null,
      hasSnapshot: Boolean(snapshot?.abortedFetchedAt),
    });
  }
  const snapshot = await loadAbortedSnapshot();
  return NextResponse.json({
    rows: snapshot?.rows ?? [],
    suiteNames: snapshot?.suiteNames ?? [],
    fetchedAt: snapshot?.fetchedAt ?? null,
    hasSnapshot: snapshot != null,
  });
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  let suiteName: string | string[] | undefined;
  let network: NetworkOverride | undefined;
  let customTabId: string | undefined;
  try {
    const body = (await req.json()) as { suiteName?: string; suiteNames?: string[]; vpnConnected?: boolean; proxyUrl?: string; customTabId?: string };
    suiteName = body?.suiteNames?.length ? body.suiteNames : body?.suiteName?.trim() || undefined;
    if (typeof body?.vpnConnected === "boolean") network = { vpnConnected: body.vpnConnected, proxyUrl: body.proxyUrl };
    customTabId = body?.customTabId;
  } catch {
    /* no body */
  }
  try {
    const customTab = customTabId ? await getCustomExecutionTab(customTabId) : null;
    if (customTabId && !customTab) return NextResponse.json({ error: "Custom execution tab not found." }, { status: 404 });
    const requestedSuites = normalizeSuiteNames(suiteName);
    const suites = requestedSuites.length ? requestedSuites : customTab?.suiteNames ?? [NGAI_SUITE_NAME];
    const result = await loadAbortedTests(suites, network);
    if (customTab) {
      await saveCustomExecutionTabAborted(customTab.id, suites, result.rows);
      return NextResponse.json({ ...result, suiteNames: suites, fetchedAt: new Date().toISOString() });
    }
    const snapshot = await saveAbortedSnapshot(suites, result.rows);
    return NextResponse.json({ ...result, suiteNames: snapshot.suiteNames, fetchedAt: snapshot.fetchedAt });
  } catch (error) {
    const status = error instanceof NGAiAuthError ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aborted tests query failed" },
      { status },
    );
  }
}

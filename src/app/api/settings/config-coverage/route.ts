import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { getConfigCoverageSettings, normalizeConfigCoverageSuites, saveConfigCoverageSettings } from "@/lib/config-coverage-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json(await getConfigCoverageSettings());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { suites?: unknown };
    const suites = normalizeConfigCoverageSuites(body.suites);
    if (!suites) return NextResponse.json({ error: "Enter 1 to 12 suites with unique labels and suite names." }, { status: 400 });
    return NextResponse.json(await saveConfigCoverageSettings(suites));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save coverage suites." }, { status: 500 });
  }
}
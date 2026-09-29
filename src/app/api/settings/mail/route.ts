import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import {
  getGraphMailSettingsStatus,
  saveGraphMailSettings,
  validateGraphMailSettings,
  type GraphMailSettings,
} from "@/lib/graph-mail-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  return NextResponse.json(await getGraphMailSettingsStatus());
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as GraphMailSettings & { clientSecret?: unknown };
    const validationError = validateGraphMailSettings(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    if (body.enabled && typeof body.clientSecret !== "string" && !(await getGraphMailSettingsStatus()).clientSecretConfigured) {
      return NextResponse.json({ error: "Enter the Microsoft Graph client secret before enabling scheduled mail." }, { status: 400 });
    }
    if (body.clientSecret != null && typeof body.clientSecret !== "string") {
      return NextResponse.json({ error: "Invalid client secret value." }, { status: 400 });
    }
    await saveGraphMailSettings(body, typeof body.clientSecret === "string" ? body.clientSecret : "");
    return NextResponse.json(await getGraphMailSettingsStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save Graph mail settings." }, { status: 500 });
  }
}
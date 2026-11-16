import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { createCustomExecutionTab, getExecutionMenuOrder, listCustomExecutionTabs, saveExecutionMenuOrder, updateCustomExecutionTab } from "@/lib/execution-tabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await authorizeRequest(req);
  if (denied) return denied;
  try {
    const [tabs, order] = await Promise.all([listCustomExecutionTabs(), getExecutionMenuOrder()]);
    return NextResponse.json({ tabs, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load execution tabs." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { name?: unknown; suiteNames?: unknown };
    const tab = await createCustomExecutionTab(body.name, body.suiteNames);
    return NextResponse.json({ tab, order: await getExecutionMenuOrder() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create execution tab." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { id?: unknown; name?: unknown; suiteNames?: unknown; enabled?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "Choose a custom execution tab to update." }, { status: 400 });
    const tab = await updateCustomExecutionTab(body.id, { name: body.name, suiteNames: body.suiteNames, enabled: body.enabled });
    return NextResponse.json({ tab, order: await getExecutionMenuOrder() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete execution tab." }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { order?: unknown };
    return NextResponse.json({ order: await saveExecutionMenuOrder(body.order) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save execution menu order." }, { status: 400 });
  }
}
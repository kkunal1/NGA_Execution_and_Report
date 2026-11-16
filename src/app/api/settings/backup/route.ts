import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { createDataBackup } from "@/lib/data-backup";
import { DATA_BACKUP_CATEGORY_KEYS, type DataBackupCategory } from "@/lib/data-backup-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { categories?: unknown };
    if (!Array.isArray(body.categories) || body.categories.some((category) => !DATA_BACKUP_CATEGORY_KEYS.includes(category as DataBackupCategory))) {
      return NextResponse.json({ error: "Select valid backup categories." }, { status: 400 });
    }
    const backup = await createDataBackup(body.categories as DataBackupCategory[]);
    const filename = `nga-execution-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    return new Response(JSON.stringify(backup), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the backup." }, { status: 400 });
  }
}
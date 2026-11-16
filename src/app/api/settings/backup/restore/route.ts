import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { restoreDataBackup } from "@/lib/data-backup";
import { DATA_BACKUP_CATEGORY_KEYS, type DataBackupCategory } from "@/lib/data-backup-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const denied = await authorizeRequest(req, true);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const backupFile = form.get("backup");
    const rawCategories = form.get("categories");
    if (!backupFile || typeof backupFile === "string" || typeof rawCategories !== "string") {
      return NextResponse.json({ error: "Choose a backup file and at least one restore category." }, { status: 400 });
    }
    if (backupFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Backup file exceeds the 500 MB size limit." }, { status: 413 });
    }
    const categories = JSON.parse(rawCategories) as unknown;
    if (!Array.isArray(categories) || categories.some((category) => !DATA_BACKUP_CATEGORY_KEYS.includes(category as DataBackupCategory))) {
      return NextResponse.json({ error: "Select valid restore categories." }, { status: 400 });
    }
    const backup = JSON.parse(await backupFile.text()) as unknown;
    const result = await restoreDataBackup(backup, categories as DataBackupCategory[]);
    return NextResponse.json({ ...result, message: "Selected backup categories were restored." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not restore the backup." }, { status: 400 });
  }
}
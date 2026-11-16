import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { isSavedReportKey } from "./saved-weekly-reports";
import { DATA_BACKUP_CATEGORY_KEYS, type DataBackupCategory } from "./data-backup-types";
import { getRefreshSettings, markRefreshCompleted } from "./refresh-settings";
import { listCustomExecutionTabSnapshotPaths } from "./execution-tabs";

const BACKUP_FORMAT = "nga-execution-tracker-backup";
const BACKUP_VERSION = 1;
const WEEKLY_REPORTS_DIRECTORY = "weekly-reports";
const EXECUTION_FILES = new Set(["latest.json", "latest-b0.json", "latest-b2.json", "aborted-latest.json", "execution-tabs.json", "execution-menu-order.json"]);
const APP_SETTING_FILES = new Set([
  "theme.json",
  "config-coverage-suites.json",
  "dashboard-settings.json",
  "pool-system-settings.json",
  "refresh-settings.json",
]);
const RUN_HISTORY_FILE = /^(?:\d{17}|\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/;
const MAX_BACKUP_FILES = 25_000;
const MAX_BACKUP_BYTES = 500 * 1024 * 1024;

type BackupFile = { path: string; content: string };
export type DataBackupBundle = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  categories: DataBackupCategory[];
  files: BackupFile[];
};

function categoryForPath(filePath: string): DataBackupCategory | null {
  if (EXECUTION_FILES.has(filePath) || RUN_HISTORY_FILE.test(filePath)) return "execution";
  if (/^execution-tab-data\/[a-f0-9]{32}\.json$/.test(filePath)) return "execution";
  if (APP_SETTING_FILES.has(filePath)) return "appSettings";
  if (filePath === "weekly-report-settings.json") return "weeklyReports";
  const weeklyReportMatch = /^weekly-reports\/([^/]+)\.json$/.exec(filePath);
  if (weeklyReportMatch && isSavedReportKey(weeklyReportMatch[1])) return "weeklyReports";
  return null;
}

export function validateDataBackup(value: unknown): DataBackupBundle {
  if (!value || typeof value !== "object") throw new TypeError("Backup file is not a valid JSON object.");
  const backup = value as Record<string, unknown>;
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new TypeError("This backup format or version is not supported.");
  }
  if (!Array.isArray(backup.categories) || !Array.isArray(backup.files) || typeof backup.createdAt !== "string") {
    throw new TypeError("Backup manifest is incomplete.");
  }

  const categories = [...new Set(backup.categories)];
  if (!categories.length || categories.some((category) => !DATA_BACKUP_CATEGORY_KEYS.includes(category as DataBackupCategory))) {
    throw new TypeError("Backup contains an unknown data category.");
  }
  if (backup.files.length > MAX_BACKUP_FILES) throw new TypeError("Backup contains too many files.");

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  const files = backup.files.map((entry) => {
    if (!entry || typeof entry !== "object") throw new TypeError("Backup contains an invalid file entry.");
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      throw new TypeError("Backup file entries must include a path and text content.");
    }
    const category = categoryForPath(file.path);
    if (!category || !categories.includes(category) || seenPaths.has(file.path)) {
      throw new TypeError(`Backup contains an unsupported or duplicate path: ${file.path}`);
    }
    if (file.path.includes("\\") || file.path.startsWith("/") || file.path.split("/").some((part) => part === ".." || part === ".")) {
      throw new TypeError("Backup contains an unsafe file path.");
    }
    try {
      JSON.parse(file.content);
    } catch {
      throw new TypeError(`Backup contains invalid JSON in ${file.path}.`);
    }
    totalBytes += Buffer.byteLength(file.content, "utf8");
    if (totalBytes > MAX_BACKUP_BYTES) throw new TypeError("Backup exceeds the 500 MB size limit.");
    seenPaths.add(file.path);
    return { path: file.path, content: file.content };
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: backup.createdAt,
    categories: categories as DataBackupCategory[],
    files,
  };
}

async function categoryPaths(category: DataBackupCategory): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(config.dataDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  if (category === "execution") {
    const rootFiles = entries.filter((entry) => entry.isFile() && categoryForPath(entry.name) === category).map((entry) => entry.name);
    return [...rootFiles, ...await listCustomExecutionTabSnapshotPaths()];
  }
  if (category === "appSettings") {
    return entries.filter((entry) => entry.isFile() && APP_SETTING_FILES.has(entry.name)).map((entry) => entry.name);
  }

  const paths = entries.filter((entry) => entry.isFile() && entry.name === "weekly-report-settings.json").map((entry) => entry.name);
  try {
    const reports = await readdir(path.join(config.dataDir, WEEKLY_REPORTS_DIRECTORY), { withFileTypes: true });
    paths.push(...reports
      .filter((entry) => entry.isFile() && categoryForPath(`${WEEKLY_REPORTS_DIRECTORY}/${entry.name}`) === "weeklyReports")
      .map((entry) => `${WEEKLY_REPORTS_DIRECTORY}/${entry.name}`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return paths;
}

export async function createDataBackup(selectedCategories: DataBackupCategory[]): Promise<DataBackupBundle> {
  const categories = [...new Set(selectedCategories)];
  if (!categories.length || categories.some((category) => !DATA_BACKUP_CATEGORY_KEYS.includes(category))) {
    throw new TypeError("Select at least one valid backup category.");
  }

  const files: BackupFile[] = [];
  for (const category of categories) {
    for (const filePath of await categoryPaths(category)) {
      files.push({ path: filePath, content: await readFile(path.join(config.dataDir, ...filePath.split("/")), "utf8") });
    }
  }
  if (files.length > MAX_BACKUP_FILES || files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0) > MAX_BACKUP_BYTES) {
    throw new TypeError("Selected data exceeds the 500 MB backup limit.");
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), categories, files };
}

async function writeBackupFile(file: BackupFile) {
  const destination = path.join(config.dataDir, ...file.path.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, file.content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function restoreDataBackup(value: unknown, selectedCategories: DataBackupCategory[]) {
  const backup = validateDataBackup(value);
  const categories = [...new Set(selectedCategories)];
  if (!categories.length || categories.some((category) => !backup.categories.includes(category))) {
    throw new TypeError("Select one or more categories included in this backup.");
  }

  for (const category of categories) {
    const pathsToRestore = new Set(backup.files.filter((file) => categoryForPath(file.path) === category).map((file) => file.path));
    for (const existingPath of await categoryPaths(category)) {
      if (!pathsToRestore.has(existingPath)) await rm(path.join(config.dataDir, ...existingPath.split("/")), { force: true });
    }
    for (const file of backup.files) {
      if (categoryForPath(file.path) === category) await writeBackupFile(file);
    }
  }

  if (categories.includes("appSettings")) {
    const settings = await getRefreshSettings();
    await markRefreshCompleted(settings.intervalSeconds);
  }
  const restoredFiles = backup.files.filter((file) => {
    const category = categoryForPath(file.path);
    return category !== null && categories.includes(category);
  }).length;
  return { categories, restoredFiles };
}
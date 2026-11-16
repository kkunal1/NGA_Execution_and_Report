import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { normalizeSuiteNames } from "./normalize";
import type { RunResult, TestRow } from "./types";

const tabsPath = path.join(config.dataDir, "execution-tabs.json");
const menuOrderPath = path.join(config.dataDir, "execution-menu-order.json");
const tabDataDirectory = path.join(config.dataDir, "execution-tab-data");
const TAB_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_TABS = 20;
const MAX_TAB_NAME_LENGTH = 60;
const MAX_SUITES_PER_TAB = 10;
const BUILTIN_EXECUTION_MENU_IDS = ["b0", "b2"] as const;

export type ExecutionMenuId = typeof BUILTIN_EXECUTION_MENU_IDS[number] | string;

export type CustomExecutionTab = {
  id: string;
  name: string;
  suiteNames: string[];
  createdAt: string;
  updatedAt?: string;
  enabled: boolean;
};

export type CustomExecutionTabSnapshot = {
  run: RunResult | null;
  abortedRows: TestRow[];
  abortedSuiteNames: string[];
  abortedFetchedAt: string | null;
};

export function isExecutionTabId(value: unknown): value is string {
  return typeof value === "string" && TAB_ID_PATTERN.test(value);
}

export function normalizeExecutionMenuOrder(value: unknown, customTabIds: string[]) {
  const validIds = [...BUILTIN_EXECUTION_MENU_IDS, ...customTabIds];
  const validSaved = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && validIds.includes(id)) : [];
  const unique = [...new Set(validSaved)];
  return [...unique, ...validIds.filter((id) => !unique.includes(id))];
}

export function isValidExecutionMenuOrder(value: unknown, customTabIds: string[]): value is string[] {
  const expected = [...BUILTIN_EXECUTION_MENU_IDS, ...customTabIds];
  return Array.isArray(value) && value.every((id): id is string => typeof id === "string") &&
    value.length === expected.length && new Set(value).size === expected.length && value.every((id) => expected.includes(id));
}

export function normalizeExecutionTabName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= MAX_TAB_NAME_LENGTH && !/[<>\r\n]/.test(name) ? name : null;
}

export function normalizeExecutionTabSuites(value: unknown): string[] | null {
  if (typeof value !== "string" && !Array.isArray(value)) return null;
  if (Array.isArray(value) && value.some((suite) => typeof suite !== "string")) return null;
  const suites = normalizeSuiteNames(value as string | string[]);
  return suites.length > 0 && suites.length <= MAX_SUITES_PER_TAB && suites.every((suite) => suite.length <= 512)
    ? suites
    : null;
}

async function readTabs(): Promise<CustomExecutionTab[]> {
  try {
    const parsed = JSON.parse(await readFile(tabsPath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    const validTabs = parsed.filter((value): value is CustomExecutionTab => {
      if (!value || typeof value !== "object") return false;
      const tab = value as Record<string, unknown>;
      return isExecutionTabId(tab.id) && normalizeExecutionTabName(tab.name) !== null &&
        Array.isArray(tab.suiteNames) && normalizeExecutionTabSuites(tab.suiteNames) !== null &&
        typeof tab.createdAt === "string" && (tab.updatedAt === undefined || typeof tab.updatedAt === "string") &&
        (tab.enabled === undefined || typeof tab.enabled === "boolean");
    });
    return validTabs.map((tab) => ({ ...tab, enabled: tab.enabled !== false }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonConfig(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const contents = JSON.stringify(value, null, 2);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EACCES" && code !== "EEXIST") throw error;
    await writeFile(filePath, contents, { encoding: "utf8", mode: 0o600 });
  }
}

async function writeTabs(tabs: CustomExecutionTab[]) {
  await writeJsonConfig(tabsPath, tabs);
}

async function writeMenuOrder(order: string[]) {
  await writeJsonConfig(menuOrderPath, order);
}

export async function getExecutionMenuOrder(): Promise<string[]> {
  const tabs = await readTabs();
  try {
    const saved = JSON.parse(await readFile(menuOrderPath, "utf8")) as unknown;
    return normalizeExecutionMenuOrder(saved, tabs.map((tab) => tab.id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return normalizeExecutionMenuOrder([], tabs.map((tab) => tab.id));
  }
}

export async function saveExecutionMenuOrder(value: unknown): Promise<string[]> {
  const tabs = await readTabs();
  const customTabIds = tabs.map((tab) => tab.id);
  if (!isValidExecutionMenuOrder(value, customTabIds)) {
    throw new TypeError("Execution menu order must include every built-in and custom tab exactly once.");
  }
  await writeMenuOrder(value);
  return value;
}

function tabDataPath(id: string) {
  if (!isExecutionTabId(id)) throw new TypeError("Invalid execution tab ID.");
  return path.join(tabDataDirectory, `${id}.json`);
}

export async function listCustomExecutionTabs() {
  return readTabs();
}

export async function getCustomExecutionTab(id: string) {
  if (!isExecutionTabId(id)) return null;
  return (await readTabs()).find((tab) => tab.id === id) ?? null;
}

export async function createCustomExecutionTab(nameValue: unknown, suitesValue: unknown) {
  const name = normalizeExecutionTabName(nameValue);
  const suiteNames = normalizeExecutionTabSuites(suitesValue);
  if (!name) throw new TypeError(`Tab name must be 2-${MAX_TAB_NAME_LENGTH} characters.`);
  if (!suiteNames) throw new TypeError(`Enter 1-${MAX_SUITES_PER_TAB} suite names, each no longer than 512 characters.`);
  const tabs = await readTabs();
  if (tabs.length >= MAX_TABS) throw new TypeError(`A maximum of ${MAX_TABS} custom tabs is allowed.`);
  if (tabs.some((tab) => tab.name.toLowerCase() === name.toLowerCase())) throw new TypeError("A tab with this name already exists.");
  const now = new Date().toISOString();
  const tab = { id: randomUUID().replace(/-/g, ""), name, suiteNames, createdAt: now, updatedAt: now, enabled: true };
  await writeTabs([...tabs, tab]);
  await writeMenuOrder(await getExecutionMenuOrder());
  return tab;
}

export async function updateCustomExecutionTabSuites(id: string, value: unknown) {
  return updateCustomExecutionTab(id, { suiteNames: value });
}

export async function updateCustomExecutionTab(id: string, input: { name?: unknown; suiteNames?: unknown; enabled?: unknown }) {
  if (!isExecutionTabId(id)) throw new TypeError("Invalid execution tab ID.");
  const tabs = await readTabs();
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) throw new TypeError("Execution tab not found.");
  const current = tabs[index];
  const name = input.name === undefined ? current.name : normalizeExecutionTabName(input.name);
  const suiteNames = input.suiteNames === undefined ? current.suiteNames : normalizeExecutionTabSuites(input.suiteNames);
  if (!name) throw new TypeError(`Tab name must be 2-${MAX_TAB_NAME_LENGTH} characters.`);
  if (!suiteNames) throw new TypeError(`Enter 1-${MAX_SUITES_PER_TAB} suite names, each no longer than 512 characters.`);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new TypeError("Tab enabled state must be a boolean.");
  if (tabs.some((tab) => tab.id !== id && tab.name.toLowerCase() === name.toLowerCase())) {
    throw new TypeError("A tab with this name already exists.");
  }
  const updated = { ...current, name, suiteNames, enabled: input.enabled ?? current.enabled, updatedAt: new Date().toISOString() };
  const next = [...tabs];
  next[index] = updated;
  await writeTabs(next);
  return updated;
}

export async function loadCustomExecutionTabSnapshot(id: string): Promise<CustomExecutionTabSnapshot | null> {
  if (!isExecutionTabId(id) || !await getCustomExecutionTab(id)) return null;
  try {
    const parsed = JSON.parse(await readFile(tabDataPath(id), "utf8")) as Partial<CustomExecutionTabSnapshot>;
    return {
      run: parsed.run ?? null,
      abortedRows: Array.isArray(parsed.abortedRows) ? parsed.abortedRows : [],
      abortedSuiteNames: Array.isArray(parsed.abortedSuiteNames) ? normalizeSuiteNames(parsed.abortedSuiteNames.filter((name): name is string => typeof name === "string")) : [],
      abortedFetchedAt: typeof parsed.abortedFetchedAt === "string" ? parsed.abortedFetchedAt : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeSnapshot(id: string, snapshot: CustomExecutionTabSnapshot) {
  if (!await getCustomExecutionTab(id)) throw new TypeError("Execution tab not found.");
  const destination = tabDataPath(id);
  await writeJsonConfig(destination, snapshot);
}

export async function saveCustomExecutionTabRun(id: string, run: RunResult) {
  const existing = await loadCustomExecutionTabSnapshot(id);
  const changed = !existing?.run || createHash("sha256").update(JSON.stringify(existing.run.rows)).digest("hex") !==
    createHash("sha256").update(JSON.stringify(run.rows)).digest("hex");
  if (!changed && existing?.run) return { changed, run: existing.run, version: await getCustomExecutionTabVersion(id) };
  await writeSnapshot(id, {
    run,
    abortedRows: existing?.abortedRows ?? [],
    abortedSuiteNames: existing?.abortedSuiteNames ?? [],
    abortedFetchedAt: existing?.abortedFetchedAt ?? null,
  });
  return { changed, run, version: await getCustomExecutionTabVersion(id) };
}

export async function saveCustomExecutionTabAborted(id: string, suiteNames: string[], rows: TestRow[]) {
  const existing = await loadCustomExecutionTabSnapshot(id);
  const normalizedSuites = normalizeSuiteNames(suiteNames);
  if (existing && JSON.stringify(existing.abortedRows) === JSON.stringify(rows) &&
    JSON.stringify(existing.abortedSuiteNames) === JSON.stringify(normalizedSuites)) return;
  await writeSnapshot(id, {
    run: existing?.run ?? null,
    abortedRows: rows,
    abortedSuiteNames: normalizedSuites,
    abortedFetchedAt: new Date().toISOString(),
  });
}

export async function getCustomExecutionTabVersion(id: string) {
  const tab = await getCustomExecutionTab(id);
  if (!isExecutionTabId(id) || !tab) return null;
  try {
    const info = await stat(tabDataPath(id));
    return `${tab.updatedAt ?? tab.createdAt}:${info.mtimeMs}:${info.size}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return `${tab.updatedAt ?? tab.createdAt}:none`;
    throw error;
  }
}

export async function listCustomExecutionTabSnapshotPaths() {
  try {
    return (await readdir(tabDataDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^[a-f0-9]{32}\.json$/.test(entry.name))
      .map((entry) => `execution-tab-data/${entry.name}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
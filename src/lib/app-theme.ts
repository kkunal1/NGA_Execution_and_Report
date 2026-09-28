import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { isThemeId, type ThemeId } from "./theme";

const themePath = path.join(config.dataDir, "theme.json");

export async function getSharedTheme(): Promise<ThemeId | null> {
  try {
    const saved = JSON.parse(await readFile(themePath, "utf8")) as { theme?: unknown };
    return typeof saved.theme === "string" && isThemeId(saved.theme) ? saved.theme : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSharedTheme(theme: ThemeId): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(themePath, JSON.stringify({ theme }), { encoding: "utf8", mode: 0o600 });
}

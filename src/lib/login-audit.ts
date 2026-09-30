import { reverse } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { AppRole } from "./auth";

export type LoginAuditEntry = {
  username: string;
  role: AppRole;
  loggedInAt: string;
  ipAddress: string;
  systemName: string;
  userAgent: string;
};

const auditPath = path.join(config.dataDir, "login-audit.json");
const MAX_ENTRIES = 500;

export function requestIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || "unknown";
}

async function resolveSystemName(ipAddress: string) {
  if (!ipAddress || ipAddress === "unknown" || ipAddress === "local") return ipAddress || "unknown";
  try {
    const names = await Promise.race([
      reverse(ipAddress),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);
    return names[0] || ipAddress;
  } catch {
    return ipAddress;
  }
}

export async function recordSuccessfulLogin(req: Request, username: string, role: AppRole) {
  const ipAddress = requestIp(req);
  const entry: LoginAuditEntry = {
    username,
    role,
    loggedInAt: new Date().toISOString(),
    ipAddress,
    systemName: await resolveSystemName(ipAddress),
    userAgent: req.headers.get("user-agent") || "unknown",
  };
  let entries: LoginAuditEntry[] = [];
  try {
    entries = JSON.parse(await readFile(auditPath, "utf8")) as LoginAuditEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(auditPath, JSON.stringify([entry, ...entries].slice(0, MAX_ENTRIES), null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getLoginAudit(): Promise<LoginAuditEntry[]> {
  try {
    const entries = JSON.parse(await readFile(auditPath, "utf8")) as unknown;
    return Array.isArray(entries) ? entries as LoginAuditEntry[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

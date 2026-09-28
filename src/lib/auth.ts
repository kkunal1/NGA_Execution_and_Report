import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export type AppRole = "admin" | "viewer";
export type AppSession = { role: AppRole; username: string; expiresAt: number };

export const AUTH_COOKIE = "nga-portal-session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const sessionKeyPath = path.join(homedir(), ".nga-execution-and-report", "session.key");

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function signingKey(): Promise<Buffer> {
  await mkdir(path.dirname(sessionKeyPath), { recursive: true, mode: 0o700 });
  try {
    const value = (await readFile(sessionKeyPath, "utf8")).trim();
    if (!/^[a-f\d]{64}$/i.test(value)) throw new Error("Invalid app session key file.");
    return Buffer.from(value, "hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const key = randomBytes(32);
  try {
    await writeFile(sessionKeyPath, `${key.toString("hex")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return signingKey();
  }
}

export function isAdminConfigured() {
  const username = process.env.APP_ADMIN_USERNAME?.trim() ?? "";
  return Boolean(username && username.toLowerCase() !== "root" && process.env.APP_ADMIN_PASSWORD);
}

export function authenticate(username: string, password: string): AppRole | null {
  if (safeEqual(username, "root") && safeEqual(password, "root")) return "viewer";
  const adminUsername = process.env.APP_ADMIN_USERNAME?.trim() ?? "";
  const adminPassword = process.env.APP_ADMIN_PASSWORD ?? "";
  if (adminUsername && adminUsername.toLowerCase() !== "root" && adminPassword &&
    safeEqual(username, adminUsername) && safeEqual(password, adminPassword)) {
    return "admin";
  }
  return null;
}

export async function createSessionToken(role: AppRole, username: string) {
  const payload = Buffer.from(JSON.stringify({
    role,
    username,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  } satisfies AppSession)).toString("base64url");
  const signature = createHmac("sha256", await signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function readSession(token: string | undefined): Promise<AppSession | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", await signingKey()).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AppSession;
    if ((session.role !== "admin" && session.role !== "viewer") ||
      typeof session.username !== "string" || typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getRequestSession(req: Request) {
  const cookie = req.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`));
  return readSession(cookie?.slice(AUTH_COOKIE.length + 1));
}

export async function authorizeRequest(req: Request, adminOnly = false): Promise<NextResponse | null> {
  const session = await getRequestSession(req);
  if (!session) return NextResponse.json({ error: "Please sign in to use this app." }, { status: 401 });
  if (adminOnly && session.role !== "admin") {
    return NextResponse.json({ error: "Admin access is required for this action." }, { status: 403 });
  }
  return null;
}

export function sessionCookieOptions(req: Request) {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

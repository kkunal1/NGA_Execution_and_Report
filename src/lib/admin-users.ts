import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type AdminUserSummary = { username: string; createdAt: string };
type StoredAdminUser = AdminUserSummary & { passwordHash: string };

const adminUsersPath = path.join(config.dataDir, "admin-users.json");
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@+-]{2,127}$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;
const HASH_BYTES = 64;

export function normalizeAdminUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (!USERNAME_PATTERN.test(username) || username.toLowerCase() === "root") return null;
  return username;
}

export function isValidAdminPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}

async function readAdminUsers(): Promise<StoredAdminUser[]> {
  try {
    const parsed = JSON.parse(await readFile(adminUsersPath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Admin user store is invalid.");
    return parsed.filter((value): value is StoredAdminUser => {
      if (typeof value !== "object" || value === null) return false;
      const user = value as Record<string, unknown>;
      return typeof user.username === "string" && typeof user.createdAt === "string" && typeof user.passwordHash === "string";
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAdminUsers(users: StoredAdminUser[]) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  await writeFile(adminUsersPath, JSON.stringify(users, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  return (await readAdminUsers())
    .map(({ username, createdAt }) => ({ username, createdAt }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function addAdminUser(usernameValue: unknown, passwordValue: unknown): Promise<AdminUserSummary> {
  const username = normalizeAdminUsername(usernameValue);
  if (!username) throw new TypeError("Username must be 3–128 characters using letters, numbers, dot, underscore, @, +, or hyphen; root is reserved.");
  if (!isValidAdminPassword(passwordValue)) throw new TypeError(`Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`);

  const environmentUsername = process.env.APP_ADMIN_USERNAME?.trim();
  if (environmentUsername && environmentUsername.toLowerCase() === username.toLowerCase()) {
    throw new TypeError("This username is already configured as the environment admin.");
  }

  const users = await readAdminUsers();
  if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new TypeError("An admin with this username already exists.");
  }

  const salt = randomBytes(16);
  const hash = scryptSync(passwordValue, salt, HASH_BYTES);
  const user: StoredAdminUser = {
    username,
    createdAt: new Date().toISOString(),
    passwordHash: `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`,
  };
  users.push(user);
  await writeAdminUsers(users);
  return { username: user.username, createdAt: user.createdAt };
}

export async function verifyStoredAdminPassword(usernameValue: string, password: string): Promise<boolean> {
  const username = usernameValue.trim().toLowerCase();
  const users = await readAdminUsers();
  const user = users.find((candidate) => candidate.username.toLowerCase() === username);
  const parts = user?.passwordHash.split("$") ?? [];
  const validFormat = parts.length === 3 && parts[0] === "scrypt";
  const salt = validFormat ? Buffer.from(parts[1], "base64url") : Buffer.alloc(16);
  const expected = validFormat ? Buffer.from(parts[2], "base64url") : Buffer.alloc(HASH_BYTES);
  const actual = scryptSync(password, salt, HASH_BYTES);
  return Boolean(user && validFormat && expected.length === actual.length && timingSafeEqual(actual, expected));
}

export async function hasStoredAdminUsers(): Promise<boolean> {
  return (await readAdminUsers()).length > 0;
}

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { config } from "./config";
import { decryptNgaiToken, encryptNgaiToken, type EncryptedToken } from "./ngai-token-crypto";

const tokenPath = path.join(config.dataDir, "ngai-token.json");
const keyPath = path.join(homedir(), ".nga-execution-and-report", "ngai-token.key");

function parseEncryptionKey(value: string): Buffer {
  const normalized = value.trim();
  if (!/^[a-f\d]{64}$/i.test(normalized)) {
    throw new Error("NGAI_TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
  }
  return Buffer.from(normalized, "hex");
}

export async function getAppEncryptionKey(): Promise<Buffer> {
  const value = process.env.NGAI_TOKEN_ENCRYPTION_KEY?.trim();
  if (value) return parseEncryptionKey(value);

  await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  try {
    return parseEncryptionKey(await readFile(keyPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const generated = randomBytes(32);
  try {
    await writeFile(keyPath, `${generated.toString("hex")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return parseEncryptionKey(await readFile(keyPath, "utf8"));
  }
}

async function readStoredToken(): Promise<EncryptedToken | null> {
  try {
    return JSON.parse(await readFile(tokenPath, "utf8")) as EncryptedToken;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getNgaiApiToken(): Promise<string> {
  const encrypted = await readStoredToken();
  if (encrypted) return decryptNgaiToken(encrypted, await getAppEncryptionKey());
  return config.ngaiApiToken;
}

export async function saveNgaiApiToken(token: string): Promise<void> {
  const encrypted = encryptNgaiToken(token, await getAppEncryptionKey());
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(tokenPath, JSON.stringify(encrypted), { encoding: "utf8", mode: 0o600 });
}

export async function removeNgaiApiToken(): Promise<void> {
  try {
    await unlink(tokenPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function getNgaiTokenStatus() {
  const encrypted = await readStoredToken();
  await getAppEncryptionKey();
  const source = encrypted ? "settings" : config.ngaiApiToken ? "environment" : "none";
  return {
    encryptionConfigured: true,
    tokenConfigured: source !== "none",
    source,
  } as const;
}
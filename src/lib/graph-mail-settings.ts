import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { decryptNgaiToken, encryptNgaiToken, type EncryptedToken } from "./ngai-token-crypto";
import { getAppEncryptionKey } from "./ngai-token";

export type GraphMailSettings = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  senderEmail: string;
  recipientEmail: string;
  sendAt: string;
  timeZone: string;
};

type StoredGraphMailSettings = GraphMailSettings & {
  encryptedClientSecret: EncryptedToken | null;
  lastSentAt?: string | null;
  lastSentDate?: string | null;
  lastError?: string | null;
  lastAttemptDate?: string | null;
  lastAttemptAt?: number | null;
  attemptsToday?: number;
};

const settingsPath = path.join(config.dataDir, "graph-mail-settings.json");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readStored(): Promise<StoredGraphMailSettings | null> {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8")) as StoredGraphMailSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function validateGraphMailSettings(input: GraphMailSettings): string | null {
  if (!input.tenantId.trim()) return "Enter the Microsoft Entra tenant ID.";
  if (!input.clientId.trim()) return "Enter the app registration client ID.";
  if (!EMAIL_PATTERN.test(input.senderEmail.trim())) return "Enter a valid sender mailbox address.";
  if (!EMAIL_PATTERN.test(input.recipientEmail.trim())) return "Enter a valid recipient email address.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendAt)) return "Enter a send time in 24-hour HH:mm format.";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }).format();
  } catch {
    return "Enter a valid IANA timezone, such as Asia/Kolkata.";
  }
  return null;
}

export async function saveGraphMailSettings(input: GraphMailSettings, clientSecret: string): Promise<void> {
  const previous = await readStored();
  let encryptedClientSecret = previous?.encryptedClientSecret ?? null;
  if (clientSecret.trim()) {
    encryptedClientSecret = encryptNgaiToken(clientSecret.trim(), await getAppEncryptionKey());
  }
  if (input.enabled && !encryptedClientSecret) throw new Error("Save the Microsoft Graph client secret before enabling scheduled email.");
  const stored: StoredGraphMailSettings = {
    enabled: input.enabled,
    tenantId: input.tenantId.trim(),
    clientId: input.clientId.trim(),
    senderEmail: input.senderEmail.trim(),
    recipientEmail: input.recipientEmail.trim(),
    sendAt: input.sendAt,
    timeZone: input.timeZone.trim(),
    encryptedClientSecret,
  };
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getGraphMailSettingsStatus() {
  const stored = await readStored();
  return {
    enabled: stored?.enabled ?? false,
    tenantId: stored?.tenantId ?? "",
    clientId: stored?.clientId ?? "",
    senderEmail: stored?.senderEmail ?? "",
    recipientEmail: stored?.recipientEmail ?? "",
    sendAt: stored?.sendAt ?? "09:00",
    timeZone: stored?.timeZone ?? "UTC",
    clientSecretConfigured: Boolean(stored?.encryptedClientSecret),
    lastSentAt: stored?.lastSentAt ?? null,
    lastError: stored?.lastError ?? null,
    lastAttemptDate: stored?.lastAttemptDate ?? null,
    attemptsToday: stored?.attemptsToday ?? 0,
  };
}

export async function getGraphMailSettings(requireEnabled = true): Promise<(GraphMailSettings & { clientSecret: string }) | null> {
  const stored = await readStored();
  if (!stored || (requireEnabled && !stored.enabled) || !stored.encryptedClientSecret) return null;
  return {
    enabled: stored.enabled,
    tenantId: stored.tenantId,
    clientId: stored.clientId,
    senderEmail: stored.senderEmail,
    recipientEmail: stored.recipientEmail,
    sendAt: stored.sendAt,
    timeZone: stored.timeZone,
    clientSecret: decryptNgaiToken(stored.encryptedClientSecret, await getAppEncryptionKey()),
  };
}

export async function markGraphMailSent(sentAt: string, localSendDate: string) {
  const stored = await readStored();
  if (!stored) return;
  await writeFile(settingsPath, JSON.stringify({
    ...stored,
    lastSentAt: sentAt,
    lastSentDate: localSendDate,
    lastError: null,
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function markGraphMailError(error: string) {
  const stored = await readStored();
  if (!stored) return;
  await writeFile(settingsPath, JSON.stringify({ ...stored, lastError: error }, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getLastGraphMailSentDate() {
  return (await readStored())?.lastSentDate ?? null;
}

export async function getGraphMailAttemptState() {
  const stored = await readStored();
  return {
    lastAttemptDate: stored?.lastAttemptDate ?? null,
    lastAttemptAt: stored?.lastAttemptAt ?? null,
    attemptsToday: stored?.attemptsToday ?? 0,
  };
}

export async function markGraphMailAttempt(localDate: string) {
  const stored = await readStored();
  if (!stored) return;
  const attemptsToday = stored.lastAttemptDate === localDate ? (stored.attemptsToday ?? 0) + 1 : 1;
  await writeFile(settingsPath, JSON.stringify({
    ...stored,
    lastAttemptDate: localDate,
    lastAttemptAt: Date.now(),
    attemptsToday,
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

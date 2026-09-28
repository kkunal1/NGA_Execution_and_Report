import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedToken = {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export function encryptNgaiToken(token: string, key: Buffer): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptNgaiToken(encrypted: EncryptedToken, key: Buffer): string {
  if (encrypted.version !== 1) throw new Error("Unsupported encrypted NGAi token format.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Could not decrypt the saved NGAi token. Check that NGAI_TOKEN_ENCRYPTION_KEY has not changed.");
  }
}
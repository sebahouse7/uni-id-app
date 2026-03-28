import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const raw = process.env["ENCRYPTION_MASTER_KEY"];
  if (!raw) throw new Error("ENCRYPTION_MASTER_KEY not set");
  return Buffer.from(raw, "hex");
}

function deriveKey(userId: string): Buffer {
  const master = getMasterKey();
  return createHmac("sha256", master).update(userId).digest();
}

export function encryptField(plaintext: string, userId: string): string {
  const key = deriveKey(userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptField(ciphertext: string, userId: string): string {
  const key = deriveKey(userId);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function verifyMercadoPagoSignature(
  rawBody: string,
  xSignature: string,
  xRequestId: string,
  secret: string
): boolean {
  try {
    const parts = xSignature.split(",");
    const tsEntry = parts.find((p) => p.startsWith("ts="));
    const v1Entry = parts.find((p) => p.startsWith("v1="));
    if (!tsEntry || !v1Entry) return false;
    const ts = tsEntry.split("=")[1];
    const v1 = v1Entry.split("=")[1];
    const template = `id:${xRequestId};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac("sha256", secret).update(template).digest("hex");
    return expected === v1;
  } catch {
    return false;
  }
}

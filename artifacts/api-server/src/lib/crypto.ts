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

/**
 * Verifica la firma HMAC-SHA256 de un webhook de MercadoPago.
 *
 * MP envía la cabecera:  x-signature: ts=1234567890,v1=<hex>
 * El template firmado es: id:{dataId};request-id:{xRequestId};ts:{ts};
 *
 * El secret es MP_WEBHOOK_SECRET (configurable en el Developer Dashboard de MP),
 * completamente distinto del MP_ACCESS_TOKEN.
 */
export function verifyMercadoPagoSignature(
  dataId: string,
  xSignature: string,
  xRequestId: string,
  webhookSecret: string
): boolean {
  try {
    const parts = xSignature.split(",");
    const tsEntry = parts.find((p) => p.startsWith("ts="));
    const v1Entry = parts.find((p) => p.startsWith("v1="));
    if (!tsEntry || !v1Entry) return false;

    const ts = tsEntry.split("=")[1];
    const v1 = v1Entry.split("=")[1];
    if (!ts || !v1) return false;

    // Template exacto según docs de MercadoPago
    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac("sha256", webhookSecret).update(template).digest("hex");

    // Comparación de tiempo constante
    if (expected.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Digital Signature Routes — uni.id
 *
 * POST /signatures/sign          — Sign a document (Ed25519 from device OR HMAC fallback)
 * GET  /signatures/mine          — List authenticated user's signatures
 * POST /signatures/verify        — Public: verify a hash+signature (supports both types)
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { queryOne } from "../lib/db";
import {
  computeHash,
  signDocument,
  verifyHmac,
  verifyEd25519,
  getSignaturesForHash,
  getUserSignatures,
  getUserPublicKey,
  getKeyFingerprint,
} from "../lib/signing";
import { requestTimestamp, saveTsaResult, markTsaPending, verifyTsaToken } from "../lib/tsa";
import { log } from "../lib/audit";

const router = Router();

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// ─── POST /signatures/sign ────────────────────────────────────────────────────
// Accepts two modes:
//   Ed25519 (preferred): client sends pre-built signature + canonicalPayload
//   HMAC (fallback):     server generates signature (legacy / when no key pair)
router.post(
  "/sign",
  requireAuth,
  [
    body("documentId").optional().isUUID().withMessage("documentId debe ser UUID válido"),
    body("signature").optional().isString().isLength({ min: 128, max: 128 }).withMessage("Firma Ed25519 debe ser 128 hex chars"),
    body("canonicalPayload").optional().isString().isLength({ max: 2048 }),
    body("deviceId").optional().isString().isLength({ max: 256 }),
    body("consented").optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const { documentId, signature: ed25519Sig, canonicalPayload, deviceId, consented = true } = req.body;

    if (!documentId) {
      res.status(400).json({ error: "documentId es requerido" });
      return;
    }

    // Verify document ownership
    const doc = await queryOne<{ id: string; title: string }>(
      `SELECT id, title FROM uni_documents WHERE id = $1 AND user_id = $2`,
      [documentId, userId]
    );
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    const user = await queryOne<{ global_id: string; signing_public_key: string | null }>(
      `SELECT global_id, signing_public_key FROM uni_users WHERE id = $1`, [userId]
    );

    let finalHash: string;
    let finalCanonical: string | undefined;
    let publicKeySnapshot: string | undefined;
    const metadata: Record<string, unknown> = { document_id: doc.id };

    if (ed25519Sig && canonicalPayload) {
      // ── Ed25519 path ──────────────────────────────────────────────────────
      // Verify signature against user's registered public key before storing
      const storedPubKey = user?.signing_public_key;
      if (!storedPubKey) {
        res.status(422).json({
          error: "No hay clave pública registrada. Activá la firma digital en la configuración.",
        });
        return;
      }

      const isValid = verifyEd25519(canonicalPayload, ed25519Sig, storedPubKey);
      if (!isValid) {
        res.status(422).json({ error: "Firma Ed25519 inválida — el payload no coincide con la clave pública" });
        return;
      }

      finalHash = computeHash(canonicalPayload);
      finalCanonical = canonicalPayload;
      publicKeySnapshot = storedPubKey;
      metadata.signature_type = "ed25519";
    } else {
      // ── HMAC fallback path ────────────────────────────────────────────────
      const canonical = JSON.stringify({
        consented,
        document_hash: computeHash(doc.id),
        timestamp: new Date().toISOString(),
        user_id: userId,
      });
      finalHash = computeHash(canonical);
      metadata.signature_type = "hmac";
      metadata.canonical = canonical;
    }

    const record = await signDocument({
      userId,
      documentId,
      contentHash: finalHash,
      ed25519Signature: ed25519Sig,
      canonicalPayload: finalCanonical,
      publicKeySnapshot,
      signerGlobalId: user?.global_id ?? undefined,
      ip: req.ip,
      deviceId,
      metadata,
      consented,
    });

    await log({
      userId,
      event: "document.signed",
      ip: req.ip,
      metadata: {
        documentId,
        signatureId: record.id,
        type: record.signature_type,
      },
    });

    // ── Respond immediately — TSA request runs in background ────────────────
    res.status(201).json({
      signatureId: record.id,
      documentHash: record.document_hash,
      signature: record.signature,
      algorithm: record.algorithm,
      signatureType: record.signature_type,
      signerGlobalId: record.signer_global_id,
      publicKeyFingerprint: record.public_key_snapshot
        ? getKeyFingerprint(record.public_key_snapshot)
        : null,
      consented: record.consented,
      createdAt: record.created_at,
      // TSA: client should poll /signatures/mine to see final tsa_status
      tsaStatus: "pending",
      tsaNote: "Timestamp criptográfico RFC 3161 en proceso. Verificá el estado en unos segundos.",
    });

    // ── Async TSA request — does NOT block the HTTP response ─────────────────
    const signatureId = record.id;
    const documentHash = record.document_hash;
    setImmediate(async () => {
      try {
        const tsaResult = await requestTimestamp(documentHash);
        if (tsaResult) {
          await saveTsaResult(signatureId, tsaResult);
        } else {
          await markTsaPending(signatureId);
        }
      } catch (err: any) {
        console.warn(`[TSA] Background request failed for ${signatureId}:`, err?.message);
        try { await markTsaPending(signatureId); } catch {}
      }
    });
  }
);

// ─── GET /signatures/mine ─────────────────────────────────────────────────────
router.get("/mine", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const signatures = await getUserSignatures(userId, limit);
  res.json({
    signatures: signatures.map(formatRecord),
    count: signatures.length,
  });
});

// ─── POST /signatures/verify ──────────────────────────────────────────────────
// Public endpoint. Accepts:
//   { documentHash, signature, userId? }  — verifies against DB record + public key
// Returns { verified, signatureType, reason, records[] }
router.post(
  "/verify",
  [
    body("documentHash").isString().isLength({ min: 10, max: 512 }).withMessage("documentHash requerido"),
    body("signature").optional().isString(),
    body("userId").optional().isUUID(),
    body("publicKey").optional().isString().isLength({ min: 64, max: 64 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { documentHash, signature, userId: reqUserId, publicKey: reqPubKey } = req.body;

    const records = await getSignaturesForHash(documentHash);

    if (records.length === 0) {
      res.json({
        verified: false,
        reason: "No se encontró firma para este hash",
        records: [],
      });
      return;
    }

    if (!signature) {
      // No signature provided — just return known records
      res.json({
        verified: true,
        reason: `${records.length} firma(s) registrada(s) para este hash`,
        records: records.map(formatRecord),
      });
      return;
    }

    // Find the matching record(s) and verify
    let verified = false;
    let signatureType = "unknown";
    let reason = "Firma inválida o adulterada";
    let matchedRecord: (typeof records)[0] | undefined;

    for (const record of records) {
      if (record.signature_type === "ed25519") {
        // Use public key from: request body > record snapshot > DB lookup
        const pubKey =
          reqPubKey ??
          record.public_key_snapshot ??
          (reqUserId ? await getUserPublicKey(reqUserId) : null);

        if (pubKey && verifyEd25519(documentHash, signature, pubKey)) {
          verified = true;
          signatureType = "ed25519";
          reason = "Firma Ed25519 válida — verificada con clave pública del usuario";
          matchedRecord = record;
          break;
        }
      } else if (record.signature_type === "hmac" || !record.signature_type) {
        if (verifyHmac(documentHash, signature)) {
          verified = true;
          signatureType = "hmac";
          reason = "Firma HMAC válida — verificada con clave del sistema";
          matchedRecord = record;
          break;
        }
      }
    }

    // ── TSA verification (if matched record has a stored token) ──────────────
    let tsaVerification: {
      status: string;
      timestamp: string | null;
      hashMatch: boolean | null;
      reason: string;
      endpoint: string | null;
    } | null = null;

    if (matchedRecord?.tsa_token && matchedRecord.tsa_status === "verified") {
      const tsaResult = verifyTsaToken(matchedRecord.tsa_token, documentHash);
      tsaVerification = {
        status: tsaResult.valid ? "valid" : "invalid",
        timestamp: tsaResult.timestamp?.toISOString() ?? null,
        hashMatch: tsaResult.hashMatch,
        reason: tsaResult.reason,
        endpoint: matchedRecord.tsa_endpoint ?? null,
      };
      if (tsaResult.valid) {
        reason += ` + Timestamp RFC 3161 externo verificado (${tsaResult.timestamp?.toISOString()})`;
      }
    } else if (matchedRecord?.tsa_status === "pending") {
      tsaVerification = {
        status: "pending",
        timestamp: null,
        hashMatch: null,
        reason: "Timestamp TSA en proceso — volvé a verificar en unos minutos",
        endpoint: null,
      };
    } else if (matchedRecord?.tsa_status === "none" || !matchedRecord?.tsa_status) {
      tsaVerification = {
        status: "not_requested",
        timestamp: null,
        hashMatch: null,
        reason: "Esta firma no tiene timestamp criptográfico externo (registro anterior al sistema TSA)",
        endpoint: null,
      };
    }

    res.json({
      verified,
      signatureType,
      reason,
      tsa: tsaVerification,
      records: records.map(formatRecord),
    });
  }
);

function formatRecord(r: any) {
  return {
    id: r.id,
    documentHash: r.document_hash,
    algorithm: r.algorithm,
    signatureType: r.signature_type ?? "hmac",
    signerGlobalId: r.signer_global_id,
    publicKeyFingerprint: r.public_key_snapshot ? getKeyFingerprint(r.public_key_snapshot) : null,
    consented: r.consented,
    createdAt: r.created_at,
    // TSA timestamp fields
    tsaStatus: r.tsa_status ?? "none",
    tsaTimestamp: r.tsa_timestamp ?? null,
    tsaEndpoint: r.tsa_endpoint ?? null,
    // tsa_token is NOT returned in list endpoints (too large) — available via /verify
  };
}

export default router;

/**
 * Digital Signature Routes
 *
 * POST /signatures/sign            — Create a signature for a document or arbitrary content
 * GET  /signatures/mine            — List signatures created by the authenticated user
 * POST /signatures/verify          — Public endpoint to verify a document hash against its signature
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { queryOne, query } from "../lib/db";
import { computeHash, signDocument, verifySignatureHex, getSignaturesForHash, getUserSignatures } from "../lib/signing";
import { log } from "../lib/audit";

const router = Router();

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// ─── POST /signatures/sign ────────────────────────────────────────────────────
// Sign a document (by ID) or arbitrary content (by providing contentHash directly).
// The signature is a verifiable proof that the authenticated user consented to sharing
// this exact document at this exact moment.
router.post(
  "/sign",
  requireAuth,
  [
    body("documentId").optional().isUUID().withMessage("documentId debe ser UUID válido"),
    body("contentHash").optional().isString().isLength({ min: 10, max: 512 }),
    body("deviceId").optional().isString().isLength({ max: 256 }),
    body("consented").optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const { documentId, contentHash: rawHash, deviceId, consented = true } = req.body;

    let finalHash: string;
    let metadata: Record<string, unknown> = {};

    if (documentId) {
      // Verify the document belongs to this user
      const doc = await queryOne<{ id: string; title: string; created_at: string }>(
        `SELECT id, title, created_at FROM uni_documents WHERE id = $1 AND user_id = $2`,
        [documentId, userId]
      );
      if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

      // Fetch user's global_id for the canonical hash
      const user = await queryOne<{ global_id: string }>(
        `SELECT global_id FROM uni_users WHERE id = $1`, [userId]
      );

      // Canonical content = deterministic JSON of identifying fields
      const canonical = JSON.stringify({
        document_id: doc.id,
        signer_global_id: user?.global_id ?? userId,
        timestamp: new Date().toISOString(),
        consented,
      });
      finalHash = computeHash(canonical);
      metadata = { document_id: doc.id, canonical };
    } else if (rawHash) {
      finalHash = computeHash(rawHash); // hash of provided content
      metadata = { source: "custom_content" };
    } else {
      res.status(400).json({ error: "Se requiere documentId o contentHash" });
      return;
    }

    const user = await queryOne<{ global_id: string }>(
      `SELECT global_id FROM uni_users WHERE id = $1`, [userId]
    );

    const record = await signDocument({
      userId,
      documentId,
      contentHash: finalHash,
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
      metadata: { documentId, signatureId: record.id },
    });

    res.status(201).json({
      signatureId: record.id,
      documentHash: record.document_hash,
      signature: record.signature,
      algorithm: record.algorithm,
      signerGlobalId: record.signer_global_id,
      consented: record.consented,
      createdAt: record.created_at,
    });
  }
);

// ─── GET /signatures/mine ─────────────────────────────────────────────────────
router.get("/mine", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const signatures = await getUserSignatures(userId, limit);
  res.json({ signatures, count: signatures.length });
});

// ─── POST /signatures/verify ──────────────────────────────────────────────────
// Public endpoint — anyone can verify if a document hash has a valid registered signature.
router.post(
  "/verify",
  [
    body("documentHash").isString().isLength({ min: 10, max: 512 }).withMessage("documentHash requerido"),
    body("signature").optional().isString(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { documentHash, signature } = req.body;

    const records = await getSignaturesForHash(documentHash);

    if (records.length === 0) {
      res.json({ verified: false, reason: "No se encontró firma para este hash", records: [] });
      return;
    }

    // If a specific signature was provided, verify it
    if (signature) {
      const isValid = verifySignatureHex(documentHash, signature);
      res.json({
        verified: isValid,
        reason: isValid ? "Firma válida — el documento no fue alterado" : "Firma inválida o adulterada",
        records: records.map((r) => ({
          id: r.id,
          algorithm: r.algorithm,
          signerGlobalId: r.signer_global_id,
          consented: r.consented,
          createdAt: r.created_at,
        })),
      });
      return;
    }

    // No specific signature — return all known records for this hash
    res.json({
      verified: true,
      reason: `${records.length} firma(s) registrada(s) para este hash`,
      records: records.map((r) => ({
        id: r.id,
        algorithm: r.algorithm,
        signerGlobalId: r.signer_global_id,
        consented: r.consented,
        createdAt: r.created_at,
      })),
    });
  }
);

export default router;

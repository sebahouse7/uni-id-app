/**
 * Evidence Routes — uni.id
 *
 * GET /evidence/:signatureId          — Self-verifiable evidence bundle (JSON)
 * GET /evidence/:signatureId/verify   — Instant server-side verification of stored evidence
 * GET /evidence/:signatureId/download — Download as .evidence.json file
 *
 * Access control:
 *   - Authenticated JWT owner: full access (includes IP/device metadata)
 *   - Valid share token (?token=<shareToken>): access without login
 *   - Document has any active share token: public access (owner chose to publish)
 *   - Otherwise: 403
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { queryOne } from "../lib/db";
import {
  buildEvidenceBundle,
  verifyEvidence,
  getSignatureOwnership,
} from "../lib/evidence";

const router = Router();

// ─── Access control helpers ───────────────────────────────────────────────────

/** Try to extract user sub from Authorization header without rejecting if absent. */
function tryGetUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Determine if a request may access evidence for this signature.
 * Returns { allowed, isOwner }.
 */
async function resolveAccess(
  signatureId: string,
  req: Request
): Promise<{ allowed: boolean; isOwner: boolean; documentId: string | null }> {
  const ownership = await getSignatureOwnership(signatureId);
  if (!ownership) return { allowed: false, isOwner: false, documentId: null };

  const documentId = ownership.document_id;

  // 1. JWT-authenticated owner
  const userId = tryGetUserId(req);
  if (userId && userId === ownership.user_id) {
    return { allowed: true, isOwner: true, documentId };
  }

  // 2. Explicit share token in query params covers this document
  const tokenParam = String(req.query["token"] ?? "").trim();
  if (tokenParam && documentId) {
    const shareToken = await queryOne<{ id: string; document_ids: string[] }>(
      `SELECT id, document_ids FROM uni_share_tokens
       WHERE id = $1 AND revoked = false AND expires_at > now()`,
      [tokenParam]
    );
    if (shareToken && shareToken.document_ids.includes(documentId)) {
      return { allowed: true, isOwner: false, documentId };
    }
  }

  // 3. Document has any active public share token (owner published it)
  if (documentId) {
    const anyActive = await queryOne<{ id: string }>(
      `SELECT id FROM uni_share_tokens
       WHERE $1 = ANY(document_ids) AND revoked = false AND expires_at > now()
       LIMIT 1`,
      [documentId]
    );
    if (anyActive) {
      return { allowed: true, isOwner: false, documentId };
    }
  }

  return { allowed: false, isOwner: false, documentId };
}

// ─── GET /evidence/:signatureId ───────────────────────────────────────────────
router.get("/:signatureId", async (req: Request, res: Response) => {
  const signatureId = String(req.params["signatureId"] ?? "").trim();
  if (!signatureId || !/^[0-9a-f-]{36}$/.test(signatureId)) {
    res.status(400).json({ error: "signatureId inválido" });
    return;
  }

  const { allowed, isOwner } = await resolveAccess(signatureId, req);
  if (!allowed) {
    res.status(403).json({
      error: "Acceso denegado. Esta evidencia requiere un token de acceso válido o autenticación.",
      hint: "Agregá ?token=<shareToken> a la URL, o autenticarte como el propietario del documento.",
    });
    return;
  }

  const bundle = await buildEvidenceBundle(signatureId, isOwner);
  if (!bundle) {
    res.status(404).json({ error: "Firma no encontrada" });
    return;
  }

  res.json(bundle);
});

// ─── GET /evidence/:signatureId/verify ───────────────────────────────────────
// Instant server-side verification — returns the VerifyEvidenceResult
router.get("/:signatureId/verify", async (req: Request, res: Response) => {
  const signatureId = String(req.params["signatureId"] ?? "").trim();
  if (!signatureId || !/^[0-9a-f-]{36}$/.test(signatureId)) {
    res.status(400).json({ error: "signatureId inválido" });
    return;
  }

  const { allowed, isOwner } = await resolveAccess(signatureId, req);
  if (!allowed) {
    res.status(403).json({
      error: "Acceso denegado.",
      hint: "Agregá ?token=<shareToken> a la URL, o autenticarte como el propietario.",
    });
    return;
  }

  const bundle = await buildEvidenceBundle(signatureId, isOwner);
  if (!bundle) {
    res.status(404).json({ error: "Firma no encontrada" });
    return;
  }

  const result = verifyEvidence(bundle);
  res.json({
    ...result,
    signatureId,
    documentHash: bundle.signature.document_hash,
    signedAt: bundle.signature.signed_at,
    signerGlobalId: bundle.signer.global_id,
  });
});

// ─── GET /evidence/:signatureId/download ─────────────────────────────────────
// Download the full evidence bundle as a .evidence.json file
router.get("/:signatureId/download", async (req: Request, res: Response) => {
  const signatureId = String(req.params["signatureId"] ?? "").trim();
  if (!signatureId || !/^[0-9a-f-]{36}$/.test(signatureId)) {
    res.status(400).json({ error: "signatureId inválido" });
    return;
  }

  const { allowed, isOwner } = await resolveAccess(signatureId, req);
  if (!allowed) {
    res.status(403).json({
      error: "Acceso denegado.",
      hint: "Agregá ?token=<shareToken> a la URL, o autenticarte como el propietario.",
    });
    return;
  }

  const bundle = await buildEvidenceBundle(signatureId, isOwner);
  if (!bundle) {
    res.status(404).json({ error: "Firma no encontrada" });
    return;
  }

  const filename = `uni-evidence-${signatureId.slice(0, 8)}.evidence.json`;
  const content = JSON.stringify(bundle, null, 2);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", Buffer.byteLength(content, "utf8").toString());
  res.send(content);
});

export default router;

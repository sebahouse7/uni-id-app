/**
 * Identity Node Routes — uni.id
 *
 * POST /node/verify              — Verify a signed event from a node (public)
 * GET  /node/me                  — Authenticated user's own node details
 * GET  /node/me/events           — Authenticated user's agent event log
 * GET  /node/me/verify/:sigId    — Self-verify a signature (owner only, no backend trust)
 * GET  /node/:nodeId             — Public node lookup by node_id
 *
 * Security model:
 *   - /node/verify is public (verifying doesn't require auth)
 *   - /node/me/* requires JWT
 *   - /node/:nodeId is public read-only
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import {
  getOrSyncNode,
  getNodeByNodeId,
  getNodeByUserId,
  getNodeByGlobalId,
  getNodeStats,
  getUserEvents,
  logAgentEvent,
  adjustReputation,
  markNodeVerified,
  verifyNodeEvent,
  deriveNodeId,
  REPUTATION_DELTAS,
} from "../lib/node";
import { buildEvidenceBundle, verifyEvidence } from "../lib/evidence";
import { queryOne } from "../lib/db";

const router = Router();

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

// ─── POST /node/verify — verify a signed event (public) ──────────────────────
//
// Input:  { event, payload, signature, publicKey?, userId?, nodeId? }
// Output: { valid, reason, node, reputationUpdated }
//
// The verifier signs a canonical payload on their device and sends it here.
// We verify the Ed25519 signature, update node reputation, and log the event.
router.post(
  "/verify",
  [
    body("event")
      .isString()
      .isLength({ min: 1, max: 128 })
      .withMessage("event requerido (tipo de evento, ej: 'login', 'access')"),
    body("payload")
      .isString()
      .isLength({ min: 1, max: 4096 })
      .withMessage("payload requerido (string que fue firmado)"),
    body("signature")
      .isString()
      .isLength({ min: 128, max: 128 })
      .withMessage("signature debe ser 128 hex chars (Ed25519)"),
    body("publicKey").optional().isString().isLength({ min: 64, max: 64 }),
    body("userId").optional().isUUID(),
    body("nodeId").optional().isString().isLength({ min: 64, max: 64 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;

    const { event, payload, signature, publicKey, userId, nodeId } = req.body as {
      event: string;
      payload: string;
      signature: string;
      publicKey?: string;
      userId?: string;
      nodeId?: string;
    };

    const result = await verifyNodeEvent({ payload, signature, publicKey, userId, nodeId });

    // Find the userId for reputation/event logging
    let targetUserId: string | null = null;
    if (userId) {
      targetUserId = userId;
    } else if (result.nodeId) {
      const node = await getNodeByNodeId(result.nodeId);
      if (node) targetUserId = node.user_id;
    }

    let newReputation: number | null = null;

    if (targetUserId) {
      const delta = result.valid
        ? (REPUTATION_DELTAS["event.verified"] ?? 0.1)
        : (REPUTATION_DELTAS["signature.invalid"] ?? -0.5);

      // Log the event
      await logAgentEvent({
        userId: targetUserId,
        nodeId: result.nodeId ?? undefined,
        eventType: result.valid ? `event.verified` : `event.invalid`,
        payload,
        signature,
        signatureValid: result.valid,
        reputationDelta: delta,
        ip: req.ip,
        metadata: { event_name: event },
      });

      // Update reputation
      newReputation = await adjustReputation(targetUserId, delta);

      // Mark node as verified on success
      if (result.valid) {
        await markNodeVerified(targetUserId);
      }
    }

    res.status(result.valid ? 200 : 422).json({
      valid: result.valid,
      reason: result.reason,
      event,
      publicKeyFingerprint: result.publicKeyFingerprint,
      nodeId: result.nodeId,
      node: result.node,
      reputationUpdated: newReputation !== null,
      newReputation,
    });
  }
);

// ─── GET /node/me — own node details (auth required) ─────────────────────────
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  // Sync node from current signing key
  const node = await getOrSyncNode(userId);
  if (!node) {
    res.status(404).json({ error: "Nodo de identidad no encontrado. Completá tu perfil." });
    return;
  }

  const stats = await getNodeStats(userId);

  res.json({
    nodeId: node.node_id,
    globalId: node.global_id,
    publicKey: node.public_key,
    publicKeyFingerprint: node.public_key ? node.public_key.slice(0, 8).toUpperCase() : null,
    trustLevel: node.trust_level,
    reputation: node.node_reputation,
    reputationLabel: reputationLabel(node.node_reputation),
    verified: node.verified,
    lastVerifiedAt: node.last_verified_at,
    createdAt: node.created_at,
    stats: {
      totalEvents: stats.totalEvents,
      verifiedEvents: stats.verifiedEvents,
      invalidSignatures: stats.invalidSignatures,
      reputationDelta7d: stats.reputationDelta7d,
    },
    network: "uni.id Global Identity Network",
    issuer: "human.id labs S.A.S.",
  });
});

// ─── GET /node/me/events — agent event log (auth required) ───────────────────
router.get("/me/events", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const events = await getUserEvents(userId, limit);

  res.json({
    events: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      eventHash: e.event_hash,
      signatureValid: e.signature_valid,
      reputationDelta: e.reputation_delta,
      createdAt: e.created_at,
      metadata: e.metadata,
    })),
    count: events.length,
  });
});

// ─── GET /node/me/verify/:signatureId — self-verify own signature ─────────────
// Runs verifyEvidence() locally — owner can validate without trusting the backend.
router.get(
  "/me/verify/:signatureId",
  requireAuth,
  [param("signatureId").isUUID().withMessage("signatureId debe ser UUID")],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const signatureId = String(req.params["signatureId"] ?? "");

    // Confirm ownership
    const ownership = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM uni_document_signatures WHERE id = $1`,
      [signatureId]
    );
    if (!ownership) {
      res.status(404).json({ error: "Firma no encontrada" });
      return;
    }
    if (ownership.user_id !== userId) {
      res.status(403).json({ error: "Esta firma no te pertenece" });
      return;
    }

    const bundle = await buildEvidenceBundle(signatureId, true);
    if (!bundle) {
      res.status(404).json({ error: "No se pudo construir el bundle de evidencia" });
      return;
    }

    const result = verifyEvidence(bundle);

    // Log self-verify event
    const node = await getNodeByUserId(userId);
    await logAgentEvent({
      userId,
      nodeId: node?.node_id ?? undefined,
      eventType: "self.verify",
      reputationDelta: 0,
      ip: req.ip,
      metadata: {
        signatureId,
        overall: result.overall,
      },
    });

    res.json({
      signatureId,
      ...result,
      bundle: {
        version: bundle._version,
        generatedAt: bundle._generated_at,
        documentHash: bundle.signature.document_hash,
        signedAt: bundle.signature.signed_at,
        tsaStatus: bundle.tsa.status,
        tsaTimestamp: bundle.tsa.timestamp,
        merkleDate: bundle.merkle.date,
        merkleIncluded: bundle.merkle.included,
      },
    });
  }
);

// ─── GET /node/:nodeId — public node lookup ───────────────────────────────────
// Accepts: 64-char hex node_id OR did:uniid:<uuid> global_id
router.get(
  "/:nodeId",
  [
    param("nodeId")
      .isString()
      .isLength({ min: 10, max: 128 })
      .withMessage("nodeId inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const rawId = String(req.params["nodeId"] ?? "").trim();

    let node = null;
    if (rawId.startsWith("did:uniid:")) {
      node = await getNodeByGlobalId(rawId);
    } else if (/^[0-9a-f]{64}$/.test(rawId)) {
      node = await getNodeByNodeId(rawId);
    } else {
      res.status(400).json({
        error: "Formato inválido. Usá un node_id (64 hex chars) o un did:uniid:<uuid>.",
      });
      return;
    }

    if (!node) {
      res.status(404).json({ error: "Nodo no encontrado en la red uni.id" });
      return;
    }

    res.json({
      nodeId: node.node_id,
      globalId: node.global_id,
      // public_key exposed for independent verification
      publicKey: node.public_key,
      publicKeyFingerprint: node.public_key
        ? node.public_key.slice(0, 8).toUpperCase()
        : null,
      trustLevel: node.trust_level,
      reputation: parseFloat(node.node_reputation.toFixed(3)),
      reputationLabel: reputationLabel(node.node_reputation),
      verified: node.verified,
      lastVerifiedAt: node.last_verified_at,
      memberSince: node.created_at,
      network: "uni.id Global Identity Network",
      issuer: "human.id labs S.A.S.",
    });
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reputationLabel(score: number): string {
  if (score >= 8.0) return "Excelente";
  if (score >= 5.0) return "Buena";
  if (score >= 2.0) return "Neutral";
  if (score >= 1.0) return "Baja";
  return "Muy baja — posibles anomalías detectadas";
}

export default router;

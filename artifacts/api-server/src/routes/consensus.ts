/**
 * Consensus routes — uni.id Light Consensus (Hardened)
 *
 * Mounted at /verify. Express matches these before the generic GET /verify/:id.
 *
 * POST /verify/vote                — cast weighted vote (auth + timestamp required)
 * GET  /verify/result/:hash        — consensus result with confidence + collusion flag
 * GET  /verify/votes/:hash         — per-node vote list (independent verification)
 * GET  /verify/vote/canonical      — exact payload to sign (includes timestamp)
 * GET  /verify/vote/weight         — preview weight for authenticated node
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { body, param, query as queryParam, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import {
  castVote,
  computeConsensus,
  getVotesForHash,
  buildVotePayload,
  calculateVoteWeight,
  validateTimestamp,
  type VoteResult,
} from "../lib/consensus";
import { getOrSyncNode } from "../lib/node";

const router = Router();

// ─── Validation helper ────────────────────────────────────────────────────────

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET /verify/vote/canonical — exact string to sign ───────────────────────
// Public. Includes timestamp so the client knows the exact payload before signing.
// Query: ?node_id=<hex64>&target_hash=<str>&result=valid|invalid&timestamp=<ms>
// If `timestamp` is omitted, the server returns the current time to use.
router.get(
  "/vote/canonical",
  [
    queryParam("node_id")
      .isString()
      .matches(/^[0-9a-f]{64}$/)
      .withMessage("node_id debe ser 64 hex chars"),
    queryParam("target_hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido"),
    queryParam("result")
      .isIn(["valid", "invalid"])
      .withMessage("result debe ser 'valid' o 'invalid'"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const nodeId     = String(req.query["node_id"] ?? "").trim();
    const targetHash = String(req.query["target_hash"] ?? "").trim();
    const result     = String(req.query["result"] ?? "") as VoteResult;

    // Use provided timestamp or issue a fresh one (client must use within 60 s)
    const rawTs = req.query["timestamp"];
    const timestampMs = rawTs ? parseInt(String(rawTs), 10) : Date.now();

    if (isNaN(timestampMs) || timestampMs <= 0) {
      res.status(400).json({ error: "timestamp inválido — debe ser ms desde epoch." });
      return;
    }

    const canonical = buildVotePayload(nodeId, targetHash, result, timestampMs);

    res.json({
      canonicalPayload: canonical,
      timestampMs,
      windowSeconds: 60,
      instructions:
        "Firmá este string exacto con tu clave Ed25519 privada (raw 32 bytes). " +
        "Enviá la firma como 128 hex chars en POST /verify/vote. " +
        "La firma expira en 60 segundos.",
      format: "Ed25519(privateKey, utf8(canonicalPayload))",
    });
  }
);

// ─── GET /verify/vote/weight — preview node vote weight ──────────────────────
// Auth required. Includes eligibility checks so the client knows before trying.
router.get(
  "/vote/weight",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const node   = await getOrSyncNode(userId);

    if (!node?.node_id) {
      res.status(400).json({
        error: "Tu nodo no tiene clave pública registrada. Registrá tu clave de firma primero.",
      });
      return;
    }

    const { weight, breakdown } = await calculateVoteWeight(node.node_id);

    // Eligibility checks (non-blocking — just informational)
    const eligible = node.node_reputation >= 1.2;
    const nodeAgeMs = Date.now() - new Date(node.created_at).getTime();
    const ageEligible = nodeAgeMs >= 60 * 60 * 1000;

    res.json({
      nodeId: node.node_id,
      weight: parseFloat(weight.toFixed(6)),
      weightBreakdown: breakdown,
      eligibility: {
        canVote: eligible && ageEligible,
        reputationOk: eligible,
        ageOk: ageEligible,
        minReputation: 1.2,
        currentReputation: node.node_reputation,
        minAgeHours: 1,
        currentAgeHours: parseFloat((nodeAgeMs / 3_600_000).toFixed(2)),
      },
      formula: "weight = reputation × 0.6 + node_age_score × 0.2 + ln(endorsements+1) × 0.2",
      network: "uni.id Light Consensus",
    });
  }
);

// ─── POST /verify/vote — cast a weighted vote ─────────────────────────────────
// Auth required. Validates timestamp window, eligibility, Ed25519 sig, then saves.
router.post(
  "/vote",
  requireAuth,
  [
    body("target_hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido (mín 8 chars)"),
    body("result")
      .isIn(["valid", "invalid"])
      .withMessage("result debe ser 'valid' o 'invalid'"),
    body("signature")
      .isString()
      .matches(/^[0-9a-f]{128}$/)
      .withMessage("signature debe ser 128 hex chars (Ed25519)"),
    body("timestamp")
      .isInt({ min: 1 })
      .withMessage("timestamp debe ser un entero positivo (ms desde epoch)"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;

    const userId = req.user!.sub;
    const {
      target_hash: targetHash,
      result,
      signature,
      timestamp,
    } = req.body as {
      target_hash: string;
      result: VoteResult;
      signature: string;
      timestamp: number;
    };

    const timestampMs = Number(timestamp);

    // Pre-fetch node for helpful error messages on sig failure
    const node = await getOrSyncNode(userId);
    const expectedPayload = node?.node_id
      ? buildVotePayload(node.node_id, targetHash, result, timestampMs)
      : null;

    try {
      const { vote, weight, weightBreakdown } = await castVote({
        userId,
        targetHash,
        result,
        signature,
        timestampMs,
        ip: req.ip,
      });

      res.status(201).json({
        status: "ok",
        message: "Voto registrado en el consenso de la red uni.id.",
        weight: parseFloat(weight.toFixed(6)),
        vote: {
          id: vote.id,
          nodeId: vote.node_id,
          targetHash: vote.target_hash,
          result: vote.result,
          timestampMs: Number(vote.timestamp_ms),
          createdAt: vote.created_at,
        },
        weightBreakdown,
        network: "uni.id Light Consensus",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error interno";

      const isDuplicate =
        msg.toLowerCase().includes("unique") ||
        (err as NodeJS.ErrnoException).code === "23505";

      if (isDuplicate) {
        res.status(409).json({
          error: "Ya votaste sobre este hash. Solo se permite un voto por nodo.",
          code: "ALREADY_VOTED",
        });
        return;
      }

      const isTimestamp = msg.includes("Timestamp fuera");
      const isEligibility =
        msg.includes("Reputación insuficiente") || msg.includes("demasiado nuevo");
      const isSignature = msg.includes("Firma inválida");
      const isNoKey = msg.includes("no tiene clave");

      const status =
        isTimestamp || isEligibility || isSignature || isNoKey ? 400 : 500;

      res.status(status).json({
        error: msg,
        ...(isSignature && expectedPayload
          ? {
              expectedPayload,
              hint: "Firmá exactamente este string con tu clave Ed25519 (encoding UTF-8).",
            }
          : {}),
        ...(isTimestamp
          ? { serverTimeMs: Date.now(), windowSeconds: 60 }
          : {}),
      });
    }
  }
);

// ─── GET /verify/result/:target_hash — consensus result ───────────────────────
// Public. Returns result, score, confidence, collusion flag, trusted_nodes.
// ?dry=true → simulates without applying penalties (skips cache too).
router.get(
  "/result/:target_hash",
  [
    param("target_hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const targetHash = String(req.params["target_hash"] ?? "").trim();
    const dry        = req.query["dry"] === "true";

    const report = await computeConsensus(targetHash, !dry, dry /* skipCache on dry */);

    res.json({
      target_hash: report.targetHash,
      result: report.result,
      score: report.score,
      confidence: report.confidence,
      trusted_nodes: report.votes.trustedNodes,
      suspicious_cluster: report.suspiciousCluster,
      votes: {
        total: report.votes.total,
        valid: report.votes.valid,
        invalid: report.votes.invalid,
        ...(report.votes.cappedAt
          ? { capped_at: report.votes.cappedAt, note: "Solo los 20 votos de mayor peso son considerados." }
          : {}),
      },
      ...(report.penaltiesApplied > 0
        ? { penalties_applied: report.penaltiesApplied }
        : {}),
      consensus_rules: {
        valid: "trusted_nodes >= 3 AND score > 1.5",
        invalid: "score < -1.5",
        partial: "ninguna condición anterior se cumple",
        confidence: "min(1.0, |score| / 5)",
        penalty: "min(0.5, voter_weight × 0.2) — proporcional al peso del voto",
        anti_spam: "máximo 20 votos por hash (top por weight)",
      },
      dry: dry || undefined,
      computed_at: report.computedAt,
      network: "uni.id Light Consensus",
      issuer: "human.id labs S.A.S.",
    });
  }
);

// ─── GET /verify/votes/:target_hash — individual vote list ────────────────────
// Public. Each vote includes timestampMs for independent collusion analysis.
router.get(
  "/votes/:target_hash",
  [
    param("target_hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const targetHash = String(req.params["target_hash"] ?? "").trim();

    const votes = await getVotesForHash(targetHash);

    res.json({
      targetHash,
      total: votes.length,
      votes,
      network: "uni.id Light Consensus",
    });
  }
);

export default router;

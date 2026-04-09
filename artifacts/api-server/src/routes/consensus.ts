/**
 * Consensus routes — uni.id Light Consensus (Hardened + Economics)
 *
 * Mounted at /verify. Express matches these before the generic GET /verify/:id.
 *
 * POST /verify/vote           — cast weighted vote (auth, timestamp, nonce)
 * GET  /verify/result/:hash   — consensus + confidence + collusion + economic_security
 * GET  /verify/votes/:hash    — per-node vote list
 * GET  /verify/vote/canonical — exact payload to sign (includes nonce)
 * GET  /verify/vote/weight    — preview weight + eligibility
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
  generateNonce,
  calculateVoteWeight,
  validateTimestamp,
  type VoteResult,
} from "../lib/consensus";
import { getOrSyncNode } from "../lib/node";

const router = Router();

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET /verify/vote/canonical ───────────────────────────────────────────────
// Returns the exact string the client must sign.
// If nonce omitted → server issues one (client must use within 60 s).
// Query: ?node_id=<hex64>&target_hash=<str>&result=valid|invalid&timestamp=<ms>&nonce=<hex32>
router.get(
  "/vote/canonical",
  [
    queryParam("node_id")
      .isString().matches(/^[0-9a-f]{64}$/)
      .withMessage("node_id debe ser 64 hex chars"),
    queryParam("target_hash")
      .isString().isLength({ min: 8, max: 256 })
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

    const rawTs  = req.query["timestamp"];
    const tsMs   = rawTs ? parseInt(String(rawTs), 10) : Date.now();
    if (isNaN(tsMs) || tsMs <= 0) {
      res.status(400).json({ error: "timestamp inválido." });
      return;
    }

    // Use provided nonce or generate one for the client
    const rawNonce = req.query["nonce"];
    const nonce    = rawNonce && /^[0-9a-f]{32}$/.test(String(rawNonce))
      ? String(rawNonce)
      : generateNonce();

    const canonical = buildVotePayload(nodeId, targetHash, result, tsMs, nonce);

    res.json({
      canonicalPayload: canonical,
      nonce,
      timestampMs: tsMs,
      windowSeconds: 60,
      nonceValidSeconds: 120,
      instructions: [
        "1. Usá este canonicalPayload EXACTO como input de tu firma Ed25519.",
        "2. El nonce es de un solo uso — generá uno nuevo para cada voto.",
        "3. La firma expira en 60 segundos (ventana de timestamp).",
        "4. Enviá { target_hash, result, signature, timestamp, nonce } a POST /verify/vote.",
      ],
      format: "Ed25519(privateKey, utf8(canonicalPayload)) → 128 hex chars",
    });
  }
);

// ─── GET /verify/vote/weight ──────────────────────────────────────────────────
// Auth required. Shows weight, eligibility, stake breakdown.
router.get(
  "/vote/weight",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const node   = await getOrSyncNode(userId);

    if (!node?.node_id) {
      res.status(400).json({
        error: "Tu nodo no tiene clave pública registrada.",
      });
      return;
    }

    const { weight, breakdown } = await calculateVoteWeight(node.node_id);

    const ageMs      = Date.now() - new Date(node.created_at).getTime();
    const repOk      = node.node_reputation >= 1.2;
    const ageOk      = ageMs >= 60 * 60 * 1000;

    res.json({
      nodeId:          node.node_id,
      weight:          parseFloat(weight.toFixed(6)),
      weightBreakdown: breakdown,
      eligibility: {
        canVote:           repOk && ageOk,
        reputationOk:      repOk,
        ageOk:             ageOk,
        minReputation:     1.2,
        currentReputation: node.node_reputation,
        minAgeHours:       1,
        currentAgeHours:   parseFloat((ageMs / 3_600_000).toFixed(2)),
      },
      formulas: {
        base:   "base = reputation × 0.6 + age_score × 0.2 + ln(endorsements+1) × 0.2",
        stake:  "weight = base × (1 + ln(stake + 1))",
        reward: "+0.02 stake si el voto coincide con el consenso",
        slash:  "-0.05 stake + penalización reputación si vota contra consenso",
      },
      network: "uni.id Light Consensus",
    });
  }
);

// ─── POST /verify/vote ────────────────────────────────────────────────────────
// Full anti-replay: timestamp window + single-use nonce + Ed25519 sig.
router.post(
  "/vote",
  requireAuth,
  [
    body("target_hash")
      .isString().isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido (mín 8 chars)"),
    body("result")
      .isIn(["valid", "invalid"])
      .withMessage("result debe ser 'valid' o 'invalid'"),
    body("signature")
      .isString().matches(/^[0-9a-f]{128}$/)
      .withMessage("signature debe ser 128 hex chars (Ed25519)"),
    body("timestamp")
      .isInt({ min: 1 })
      .withMessage("timestamp debe ser entero positivo (ms desde epoch)"),
    body("nonce")
      .isString().matches(/^[0-9a-f]{32}$/)
      .withMessage("nonce debe ser 32 hex chars (16 bytes aleatorios)"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;

    const userId = req.user!.sub;
    const { target_hash: targetHash, result, signature, timestamp, nonce } = req.body as {
      target_hash: string;
      result: VoteResult;
      signature: string;
      timestamp: number;
      nonce: string;
    };
    const timestampMs = Number(timestamp);

    const node = await getOrSyncNode(userId);
    const expectedPayload = node?.node_id
      ? buildVotePayload(node.node_id, targetHash, result, timestampMs, nonce)
      : null;

    try {
      const { vote, weight, weightBreakdown } = await castVote({
        userId, targetHash, result, signature, timestampMs, nonce,
        ip: req.ip,
      });

      res.status(201).json({
        status:  "ok",
        message: "Voto registrado en el consenso de la red uni.id.",
        weight:  parseFloat(weight.toFixed(6)),
        vote: {
          id:          vote.id,
          nodeId:      vote.node_id,
          targetHash:  vote.target_hash,
          result:      vote.result,
          timestampMs: Number(vote.timestamp_ms),
          nonce:       vote.nonce,
          createdAt:   vote.created_at,
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
          code:  "ALREADY_VOTED",
        });
        return;
      }

      const isReplay      = msg.includes("Replay detectado");
      const isRateLimit   = msg.includes("Rate limit");
      const isTimestamp   = msg.includes("Timestamp fuera");
      const isEligibility = msg.includes("Reputación insuficiente") || msg.includes("demasiado nuevo");
      const isSignature   = msg.includes("Firma inválida");
      const isNoKey       = msg.includes("no tiene clave");
      const isNonce       = msg.includes("nonce inválido");

      const status =
        isReplay || isRateLimit || isTimestamp || isEligibility ||
        isSignature || isNoKey || isNonce
          ? 400 : 500;

      res.status(status).json({
        error: msg,
        ...(isSignature && expectedPayload
          ? { expectedPayload, hint: "Firmá exactamente este string (UTF-8)." }
          : {}),
        ...(isTimestamp
          ? { serverTimeMs: Date.now(), windowSeconds: 60 }
          : {}),
        ...(isReplay ? { code: "REPLAY_DETECTED" } : {}),
        ...(isRateLimit ? { code: "RATE_LIMIT_EXCEEDED" } : {}),
      });
    }
  }
);

// ─── GET /verify/result/:target_hash ─────────────────────────────────────────
// Consensus result with confidence, collusion flag, economic_security.
// ?dry=true → no penalties, no cache.
router.get(
  "/result/:target_hash",
  [
    param("target_hash")
      .isString().isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const targetHash = String(req.params["target_hash"] ?? "").trim();
    const dry        = req.query["dry"] === "true";

    const report = await computeConsensus(targetHash, !dry, dry);

    res.json({
      target_hash:        report.targetHash,
      result:             report.result,
      score:              report.score,
      confidence:         report.confidence,
      trusted_nodes:      report.votes.trustedNodes,
      economic_security:  report.economicSecurity,
      suspicious_cluster: report.suspiciousCluster,
      votes: {
        total:   report.votes.total,
        valid:   report.votes.valid,
        invalid: report.votes.invalid,
        ...(report.votes.cappedAt
          ? { capped_at: report.votes.cappedAt,
              note: "Solo los 20 votos de mayor peso son considerados." }
          : {}),
      },
      ...(report.penaltiesApplied > 0
        ? { penalties_applied: report.penaltiesApplied }
        : {}),
      ...(report.stakeRewardsApplied > 0
        ? { stake_rewards_applied: report.stakeRewardsApplied }
        : {}),
      consensus_rules: {
        valid:             "trusted_nodes ≥ 3 AND score > 1.5",
        invalid:           "score < -1.5",
        partial:           "ninguna condición anterior",
        confidence:        "min(1.0, |score| / 5)",
        economic_security: "high: trusted≥5 AND |score|>3 | medium: trusted≥3 AND |score|>1.5",
        penalty:           "min(0.5, weight×0.2) reputación + 0.05 stake",
        reward:            "+0.02 stake por votar con el consenso",
        anti_spam:         "máximo 20 votos por hash (top por weight)",
        anti_replay:       "nonce de un solo uso + ventana ±60 s",
      },
      dry:         dry || undefined,
      computed_at: report.computedAt,
      network:     "uni.id Light Consensus",
      issuer:      "human.id labs S.A.S.",
    });
  }
);

// ─── GET /verify/votes/:target_hash ──────────────────────────────────────────
router.get(
  "/votes/:target_hash",
  [
    param("target_hash")
      .isString().isLength({ min: 8, max: 256 })
      .withMessage("target_hash inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const targetHash = String(req.params["target_hash"] ?? "").trim();
    const votes      = await getVotesForHash(targetHash);

    res.json({ targetHash, total: votes.length, votes, network: "uni.id Light Consensus" });
  }
);

export default router;

/**
 * Consensus routes — uni.id Light Consensus Layer
 *
 * Mounted at /verify (alongside the existing identity /verify/:id endpoint).
 * Express will match these specific sub-paths first; the generic /:id
 * handler in index.ts remains untouched as a fallback.
 *
 * POST /verify/vote         — cast a weighted vote (auth required)
 * GET  /verify/result/:hash — compute/read consensus for a hash
 * GET  /verify/votes/:hash  — list individual votes for a hash
 * GET  /verify/vote/canonical — helper: return expected signing payload
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

// ─── GET /verify/vote/canonical — helper endpoint ─────────────────────────────
// Returns the exact string the client must sign for a given vote.
// Public. Prevents any ambiguity about what to sign.
// Query: ?node_id=<hex64>&target_hash=<hex>&result=valid|invalid
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
    const nodeId = String(req.query["node_id"] ?? "").trim();
    const targetHash = String(req.query["target_hash"] ?? "").trim();
    const result = String(req.query["result"] ?? "") as VoteResult;

    const canonical = buildVotePayload(nodeId, targetHash, result);

    res.json({
      canonicalPayload: canonical,
      instructions:
        "Firmá este string exacto con tu clave Ed25519 privada. " +
        "Enviá la firma como 128 hex chars en POST /verify/vote.",
      format: "Ed25519(privateKey, canonicalPayload, encoding='utf8')",
    });
  }
);

// ─── GET /verify/vote/weight — preview vote weight for authenticated node ─────
// Auth required. Shows what weight a vote from this node would have.
router.get(
  "/vote/weight",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const node = await getOrSyncNode(userId);

    if (!node?.node_id) {
      res.status(400).json({
        error:
          "Tu nodo no tiene clave pública registrada. Registrá tu clave de firma primero.",
      });
      return;
    }

    const { weight, breakdown } = await calculateVoteWeight(node.node_id);

    res.json({
      nodeId: node.node_id,
      weight: parseFloat(weight.toFixed(6)),
      weightBreakdown: {
        reputation: breakdown.reputation,
        reputationComponent: breakdown.reputationComponent,
        nodeAgeScore: breakdown.nodeAgeScore,
        ageComponent: breakdown.ageComponent,
        totalEndorsements: breakdown.totalEndorsements,
        endorsementComponent: breakdown.endorsementComponent,
      },
      formula:
        "weight = reputation × 0.6 + node_age_score × 0.2 + ln(endorsements + 1) × 0.2",
      network: "uni.id Light Consensus",
    });
  }
);

// ─── POST /verify/vote — cast a weighted vote ─────────────────────────────────
// Auth required. Verifies Ed25519 signature over canonical payload before saving.
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
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const { target_hash: targetHash, result, signature } = req.body as {
      target_hash: string;
      result: VoteResult;
      signature: string;
    };

    // Pre-fetch node for helpful error messages
    const node = await getOrSyncNode(userId);
    const expectedPayload =
      node?.node_id ? buildVotePayload(node.node_id, targetHash, result) : null;

    try {
      const { vote, weight, weightBreakdown } = await castVote({
        userId,
        targetHash,
        result,
        signature,
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

      const isClient =
        msg.includes("no tiene clave") ||
        msg.includes("Firma inválida");

      res.status(isClient ? 400 : 500).json({
        error: msg,
        ...(expectedPayload && msg.includes("Firma inválida")
          ? {
              expectedPayload,
              hint: "Firmá exactamente este string con tu clave Ed25519.",
            }
          : {}),
      });
    }
  }
);

// ─── GET /verify/result/:target_hash — compute consensus ──────────────────────
// Public. Computes and returns the consensus result, applying penalties if clear.
// Query: ?dry=true to skip penalty application (preview only)
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
    const dry = req.query["dry"] === "true";

    const report = await computeConsensus(targetHash, !dry);

    res.json({
      target_hash: report.targetHash,
      result: report.result,
      score: report.score,
      votes: report.votes,
      ...(report.penaltiesApplied > 0
        ? { penaltiesApplied: report.penaltiesApplied }
        : {}),
      consensus: {
        rules: {
          valid: "trusted_nodes >= 3 AND score > 1.5",
          invalid: "score < -1.5",
          partial: "no se cumple ninguna condición anterior",
        },
        trustedNodeThreshold: "reputation >= 2.0",
        scoreFormula: "SUM(weight_valid) - SUM(weight_invalid)",
      },
      dry: dry || undefined,
      computedAt: report.computedAt,
      network: "uni.id Light Consensus",
      issuer: "human.id labs S.A.S.",
    });
  }
);

// ─── GET /verify/votes/:target_hash — list individual votes ───────────────────
// Public. Returns per-node votes for independent verification.
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

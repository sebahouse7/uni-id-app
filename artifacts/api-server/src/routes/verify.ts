/**
 * Document verification entry route — uni.id
 *
 * POST /verify/document
 *   Registers a document hash for consensus evaluation.
 *   The autonomous node worker picks it up within 30 s.
 *
 * GET /verify/document/:hash
 *   Returns current verification status + consensus result if available.
 *
 * GET /verify/node/status
 *   Public endpoint — returns autonomous node health.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
import { computeConsensus } from "../lib/consensus";
import { getAutonomousNodeStatus } from "../lib/autonomousNode";

const router = Router();

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── POST /verify/document ────────────────────────────────────────────────────
router.post(
  "/document",
  [
    body("file_hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("file_hash debe ser un string hexadecimal (min 8, max 256 chars)"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;

    const fileHash    = String(req.body.file_hash).trim().toLowerCase();
    const submitterIp = req.ip ?? null;

    // Upsert into pending_verifications
    const existing = await queryOne<{
      id: string;
      status: string;
      consensus_result: string | null;
      confidence: number | null;
      votes_collected: number;
      created_at: string;
    }>(
      `SELECT id, status, consensus_result, confidence, votes_collected, created_at
       FROM pending_verifications
       WHERE file_hash = $1`,
      [fileHash]
    );

    if (existing) {
      // Already submitted — return current state
      const consensus = await computeConsensus(fileHash, false, true);
      res.json({
        hash:            fileHash,
        status:          existing.status,
        consensus_result: existing.consensus_result,
        confidence:      existing.confidence,
        votes_collected: existing.votes_collected,
        votes: {
          total:   consensus.votes.total,
          valid:   consensus.votes.valid,
          invalid: consensus.votes.invalid,
        },
        economic_security: consensus.economicSecurity,
        message:         "Hash ya registrado — volvé a consultar para ver el progreso.",
        submitted_at:    existing.created_at,
        network:         "uni.id Light Consensus",
      });
      return;
    }

    await query(
      `INSERT INTO pending_verifications (file_hash, submitter_ip, status)
       VALUES ($1, $2, 'pending')`,
      [fileHash, submitterIp]
    );

    res.status(201).json({
      hash:    fileHash,
      status:  "pending",
      message: "Hash registrado. El nodo autónomo lo evaluará en los próximos 30 segundos.",
      polling: {
        url:           `/verify/document/${fileHash}`,
        intervalSuggestedMs: 10_000,
        description:   "Consultá este endpoint periódicamente para ver el resultado del consenso.",
      },
      network: "uni.id Light Consensus",
      issuer:  "human.id labs S.A.S.",
    });
  }
);

// ─── GET /verify/document/:hash ───────────────────────────────────────────────
router.get(
  "/document/:hash",
  [
    param("hash")
      .isString()
      .isLength({ min: 8, max: 256 })
      .withMessage("hash inválido"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const fileHash = String(req.params["hash"]).trim().toLowerCase();

    const row = await queryOne<{
      status: string;
      consensus_result: string | null;
      confidence: number | null;
      votes_collected: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT status, consensus_result, confidence, votes_collected, created_at, updated_at
       FROM pending_verifications
       WHERE file_hash = $1`,
      [fileHash]
    );

    if (!row) {
      res.status(404).json({
        error:   "Hash no encontrado. Registralo primero con POST /verify/document.",
        hash:    fileHash,
        network: "uni.id Light Consensus",
      });
      return;
    }

    // Live consensus from votes
    const report = await computeConsensus(fileHash, false, true);

    res.json({
      hash:             fileHash,
      status:           row.status,
      consensus_result: report.result !== "partial" ? report.result : (row.consensus_result ?? "pending"),
      confidence:       parseFloat(report.confidence.toFixed(4)),
      economic_security: report.economicSecurity,
      votes: {
        total:        report.votes.total,
        valid:        report.votes.valid,
        invalid:      report.votes.invalid,
        trusted_nodes: report.votes.trustedNodes,
      },
      score:           report.score,
      suspicious:      report.suspiciousCluster,
      submitted_at:    row.created_at,
      last_updated_at: row.updated_at,
      network:         "uni.id Light Consensus",
      issuer:          "human.id labs S.A.S.",
    });
  }
);

// ─── GET /verify/node/status ──────────────────────────────────────────────────
router.get("/node/status", (_req: Request, res: Response) => {
  const { running, nodeId, aggressiveness } = getAutonomousNodeStatus();
  res.json({
    autonomous_node: {
      running,
      node_id:         nodeId ? nodeId.slice(0, 16) + "…" : null,
      aggressiveness:  parseFloat(aggressiveness.toFixed(4)),
      loop_interval_s: 30,
      description:
        "El nodo autónomo evalúa hashes pendientes y vota en el consenso sin intervención humana.",
    },
    network: "uni.id Light Consensus",
    issuer:  "human.id labs S.A.S.",
  });
});

export default router;

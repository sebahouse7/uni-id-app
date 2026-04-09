/**
 * Stake routes — uni.id Economic Layer
 *
 * Stake is stored in identity_nodes.stake (float).
 * Every add/withdraw/reward/slash is logged in stake_transactions.
 *
 * Stake influences vote weight:
 *   weight = base_weight × (1 + ln(stake + 1))
 *
 * Stake rewards / slashing happen automatically in consensus computation.
 * These endpoints manage manual add/withdraw only.
 *
 * POST /stake/add      — add stake to your node (auth required)
 * POST /stake/withdraw — withdraw stake from your node (auth required)
 * GET  /stake/me       — current stake + transaction history (auth required)
 * GET  /stake/info     — public formula explanation (no auth)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { query, queryOne } from "../lib/db";
import { getOrSyncNode } from "../lib/node";
import { calculateVoteWeight } from "../lib/consensus";

const router = Router();

const MAX_STAKE    = 100.0;
const MIN_ADD      = 0.01;
const MIN_WITHDRAW = 0.01;

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET /stake/info — public formula info ────────────────────────────────────
router.get("/info", async (_req: Request, res: Response) => {
  res.json({
    description:
      "El stake amplifica el peso de los votos en el consenso de la red uni.id. " +
      "Los nodos que votan correctamente reciben recompensas; los que votan mal son penalizados.",
    weightFormula:
      "weight = base_weight × (1 + ln(stake + 1))",
    baseFormula:
      "base_weight = reputation × 0.6 + node_age_score × 0.2 + ln(endorsements+1) × 0.2",
    stakeMultiplierExamples: [
      { stake: 0,   multiplier: 1.0,   note: "Sin stake — peso base" },
      { stake: 1,   multiplier: 1.693, note: "+69% de peso" },
      { stake: 5,   multiplier: 2.792, note: "+179% de peso" },
      { stake: 10,  multiplier: 3.398, note: "+240% de peso" },
      { stake: 50,  multiplier: 4.930, note: "+393% de peso" },
    ],
    rewards: {
      onConsensusWin: "+0.02 stake",
      onConsensusLoss: "-0.05 stake + reputation penalty",
    },
    limits: { max: MAX_STAKE },
    network: "uni.id Light Consensus",
    issuer: "human.id labs S.A.S.",
  });
});

// ─── GET /stake/me — current stake + transactions ─────────────────────────────
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const node   = await getOrSyncNode(userId);

  if (!node?.node_id) {
    res.status(400).json({
      error: "Tu nodo no tiene clave pública registrada.",
    });
    return;
  }

  const nodeRow = await queryOne<{ stake: number; node_reputation: number }>(
    `SELECT stake, node_reputation FROM identity_nodes WHERE user_id = $1`,
    [userId]
  );

  const stake = nodeRow?.stake ?? 0;
  const { weight, breakdown } = await calculateVoteWeight(node.node_id);

  const transactions = await query<{
    id: string;
    type: string;
    amount: number;
    balance_after: number;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT id, type, amount, balance_after, reason, created_at
     FROM stake_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );

  res.json({
    nodeId:          node.node_id,
    stake:           parseFloat(stake.toFixed(6)),
    stakeMultiplier: parseFloat(breakdown.stakeMultiplier.toFixed(6)),
    currentWeight:   weight,
    reputation:      nodeRow?.node_reputation ?? 1.0,
    maxStake:        MAX_STAKE,
    transactions:    transactions.map((t) => ({
      id:           t.id,
      type:         t.type,
      amount:       parseFloat(t.amount.toFixed(6)),
      balanceAfter: parseFloat(t.balance_after.toFixed(6)),
      reason:       t.reason,
      createdAt:    t.created_at,
    })),
    network: "uni.id Light Consensus",
  });
});

// ─── POST /stake/add ──────────────────────────────────────────────────────────
router.post(
  "/add",
  requireAuth,
  [
    body("amount")
      .isFloat({ min: MIN_ADD, max: MAX_STAKE })
      .withMessage(`amount debe ser un float entre ${MIN_ADD} y ${MAX_STAKE}`),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const amount = parseFloat(req.body.amount);

    const node = await getOrSyncNode(userId);
    if (!node?.node_id) {
      res.status(400).json({ error: "Tu nodo no tiene clave pública registrada." });
      return;
    }

    // Get current stake and check cap
    const nodeRow = await queryOne<{ stake: number }>(
      `SELECT stake FROM identity_nodes WHERE user_id = $1`,
      [userId]
    );
    const current = nodeRow?.stake ?? 0;
    if (current + amount > MAX_STAKE) {
      res.status(400).json({
        error: `El stake resultante (${(current + amount).toFixed(2)}) excedería el máximo de ${MAX_STAKE}.`,
        current: parseFloat(current.toFixed(6)),
        max: MAX_STAKE,
      });
      return;
    }

    const newStake = parseFloat((current + amount).toFixed(6));

    await query(
      `UPDATE identity_nodes SET stake = $1, updated_at = now() WHERE user_id = $2`,
      [newStake, userId]
    );
    await query(
      `INSERT INTO stake_transactions (user_id, node_id, type, amount, balance_after, reason)
       VALUES ($1, $2, 'add', $3, $4, 'Manual add')`,
      [userId, node.node_id, amount, newStake]
    );

    const { weight, breakdown } = await calculateVoteWeight(node.node_id);

    res.status(201).json({
      status:          "ok",
      message:         `Stake agregado. Tu peso de voto aumentó.`,
      stake:           newStake,
      stakeMultiplier: parseFloat(breakdown.stakeMultiplier.toFixed(6)),
      newWeight:       weight,
      delta:           parseFloat(amount.toFixed(6)),
    });
  }
);

// ─── POST /stake/withdraw ─────────────────────────────────────────────────────
router.post(
  "/withdraw",
  requireAuth,
  [
    body("amount")
      .isFloat({ min: MIN_WITHDRAW })
      .withMessage(`amount debe ser un float ≥ ${MIN_WITHDRAW}`),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const amount = parseFloat(req.body.amount);

    const node = await getOrSyncNode(userId);
    if (!node?.node_id) {
      res.status(400).json({ error: "Tu nodo no tiene clave pública registrada." });
      return;
    }

    const nodeRow = await queryOne<{ stake: number }>(
      `SELECT stake FROM identity_nodes WHERE user_id = $1`,
      [userId]
    );
    const current = nodeRow?.stake ?? 0;

    if (amount > current) {
      res.status(400).json({
        error: `No podés retirar ${amount.toFixed(4)} — stake actual: ${current.toFixed(4)}.`,
        current: parseFloat(current.toFixed(6)),
      });
      return;
    }

    const newStake = parseFloat(Math.max(0, current - amount).toFixed(6));

    await query(
      `UPDATE identity_nodes SET stake = $1, updated_at = now() WHERE user_id = $2`,
      [newStake, userId]
    );
    await query(
      `INSERT INTO stake_transactions (user_id, node_id, type, amount, balance_after, reason)
       VALUES ($1, $2, 'withdraw', $3, $4, 'Manual withdraw')`,
      [userId, node.node_id, amount, newStake]
    );

    const { weight, breakdown } = await calculateVoteWeight(node.node_id);

    res.json({
      status:          "ok",
      message:         "Retiro de stake completado.",
      stake:           newStake,
      stakeMultiplier: parseFloat(breakdown.stakeMultiplier.toFixed(6)),
      newWeight:       weight,
      delta:           -parseFloat(amount.toFixed(6)),
    });
  }
);

export default router;

/**
 * Light Consensus — uni.id
 *
 * Multiple nodes vote on the validity of a document hash (or any event hash).
 * The result is determined by weighted vote aggregation — not by a single authority.
 *
 * Vote weight formula:
 *   weight = reputation * 0.6
 *           + node_age_score * 0.2
 *           + ln(total_endorsements + 1) * 0.2
 *
 * Consensus rules:
 *   "valid"   → trusted_nodes >= 3 AND score > 1.5
 *   "invalid" → score < -1.5
 *   "partial" → anything else (insufficient votes or split)
 *
 * Penalty:
 *   When consensus is clear (valid or invalid), nodes that voted against
 *   the final result lose reputation -= 0.3. Applied once per vote.
 */

import { query, queryOne } from "./db";
import { verifyEd25519 } from "./signing";
import { getOrSyncNode } from "./node";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoteResult = "valid" | "invalid";
export type ConsensusResult = "valid" | "invalid" | "partial";

export interface VerificationVote {
  id: string;
  node_id: string;
  target_hash: string;
  result: VoteResult;
  signature: string;
  canonical_payload: string;
  weight: number;
  penalty_applied: boolean;
  created_at: string;
}

export interface ConsensusReport {
  targetHash: string;
  result: ConsensusResult;
  score: number;
  votes: {
    total: number;
    valid: number;
    invalid: number;
    trustedNodes: number;
  };
  penaltiesApplied: number;
  computedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENSUS_VALID_SCORE_THRESHOLD = 1.5;
const CONSENSUS_INVALID_SCORE_THRESHOLD = -1.5;
const CONSENSUS_MIN_TRUSTED_NODES = 3;
const TRUST_REPUTATION_THRESHOLD = 2.0;
const PENALTY_DELTA = -0.3;

// ─── Canonical payload ────────────────────────────────────────────────────────

/**
 * The client MUST sign exactly this string.
 * Format: "vote::<node_id>::<target_hash>::<result>"
 */
export function buildVotePayload(
  nodeId: string,
  targetHash: string,
  result: VoteResult
): string {
  return `vote::${nodeId}::${targetHash}::${result}`;
}

// ─── Weight calculation ───────────────────────────────────────────────────────

/**
 * Node age score: 0.0 (new) → 1.0 (1 year or older)
 */
function nodeAgeScore(createdAt: string | Date): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const daysSince = (now - created) / (1000 * 60 * 60 * 24);
  return Math.min(1.0, daysSince / 365);
}

/**
 * Calculate the vote weight for a node.
 * weight = reputation * 0.6 + age_score * 0.2 + ln(endorsements + 1) * 0.2
 */
export async function calculateVoteWeight(nodeId: string): Promise<{
  weight: number;
  breakdown: {
    reputationComponent: number;
    ageComponent: number;
    endorsementComponent: number;
    totalEndorsements: number;
    nodeAgeScore: number;
    reputation: number;
  };
}> {
  const nodeRow = await queryOne<{
    node_reputation: number;
    created_at: string;
  }>(
    `SELECT node_reputation, created_at
     FROM identity_nodes
     WHERE node_id = $1`,
    [nodeId]
  );

  const reputation = nodeRow?.node_reputation ?? 1.0;
  const age = nodeAgeScore(nodeRow?.created_at ?? new Date().toISOString());

  const endorsementsRow = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM node_endorsements WHERE to_node_id = $1`,
    [nodeId]
  );
  const totalEndorsements = parseInt(endorsementsRow?.cnt ?? "0", 10);

  const reputationComponent = reputation * 0.6;
  const ageComponent = age * 0.2;
  const endorsementComponent = Math.log(totalEndorsements + 1) * 0.2;

  const weight = reputationComponent + ageComponent + endorsementComponent;

  return {
    weight: parseFloat(weight.toFixed(6)),
    breakdown: {
      reputationComponent: parseFloat(reputationComponent.toFixed(6)),
      ageComponent: parseFloat(ageComponent.toFixed(6)),
      endorsementComponent: parseFloat(endorsementComponent.toFixed(6)),
      totalEndorsements,
      nodeAgeScore: parseFloat(age.toFixed(6)),
      reputation,
    },
  };
}

export interface WeightBreakdown {
  reputationComponent: number;
  ageComponent: number;
  endorsementComponent: number;
  totalEndorsements: number;
  nodeAgeScore: number;
  reputation: number;
}

// ─── Cast vote ────────────────────────────────────────────────────────────────

export async function castVote(params: {
  userId: string;
  targetHash: string;
  result: VoteResult;
  signature: string;
  ip?: string | null;
}): Promise<{
  vote: VerificationVote;
  weight: number;
  weightBreakdown: WeightBreakdown;
}> {
  const { userId, targetHash, result, signature, ip } = params;

  // 1. Resolve the voting node
  const node = await getOrSyncNode(userId);
  if (!node?.node_id || !node.public_key) {
    throw new Error(
      "Tu nodo no tiene clave pública registrada. Registrá tu clave de firma para participar en el consenso."
    );
  }

  // 2. Build and verify canonical payload
  const canonical = buildVotePayload(node.node_id, targetHash, result);
  const valid = verifyEd25519(canonical, signature, node.public_key);
  if (!valid) {
    throw new Error(
      `Firma inválida. Debés firmar exactamente: "${canonical}"`
    );
  }

  // 3. Calculate weight
  const { weight, breakdown } = await calculateVoteWeight(node.node_id);

  // 4. Insert (UNIQUE constraint prevents duplicate vote)
  const row = await queryOne<VerificationVote>(
    `INSERT INTO verification_votes
       (node_id, target_hash, result, signature, canonical_payload, weight)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, node_id, target_hash, result, signature, canonical_payload,
               weight, penalty_applied, created_at`,
    [node.node_id, targetHash, result, signature, canonical, weight]
  );

  // 5. Log agent event
  const { logAgentEvent } = await import("./node");
  await logAgentEvent({
    userId,
    nodeId: node.node_id,
    eventType: "consensus.vote",
    payload: canonical,
    signature,
    signatureValid: true,
    reputationDelta: 0,
    ip,
    metadata: { targetHash, result, weight },
  });

  return { vote: row!, weight, weightBreakdown: breakdown };
}

// ─── Compute consensus ────────────────────────────────────────────────────────

interface VoteRow {
  id: string;
  node_id: string;
  result: VoteResult;
  weight: number;
  penalty_applied: boolean;
  node_reputation: number | null;
}

export async function computeConsensus(
  targetHash: string,
  applyPenalties = true
): Promise<ConsensusReport> {
  // 1. Load all votes with node reputation
  const votes = await query<VoteRow>(
    `SELECT v.id, v.node_id, v.result, v.weight, v.penalty_applied,
            n.node_reputation
     FROM verification_votes v
     LEFT JOIN identity_nodes n ON n.node_id = v.node_id
     WHERE v.target_hash = $1`,
    [targetHash]
  );

  if (votes.length === 0) {
    return {
      targetHash,
      result: "partial",
      score: 0,
      votes: { total: 0, valid: 0, invalid: 0, trustedNodes: 0 },
      penaltiesApplied: 0,
      computedAt: new Date().toISOString(),
    };
  }

  // 2. Aggregate scores
  let validWeight = 0;
  let invalidWeight = 0;
  let trustedNodes = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (const v of votes) {
    const rep = v.node_reputation ?? 1.0;
    if (v.result === "valid") {
      validWeight += v.weight;
      validCount++;
    } else {
      invalidWeight += v.weight;
      invalidCount++;
    }
    if (rep >= TRUST_REPUTATION_THRESHOLD) {
      trustedNodes++;
    }
  }

  const score = parseFloat((validWeight - invalidWeight).toFixed(6));

  // 3. Determine consensus result
  let result: ConsensusResult = "partial";
  if (trustedNodes >= CONSENSUS_MIN_TRUSTED_NODES && score > CONSENSUS_VALID_SCORE_THRESHOLD) {
    result = "valid";
  } else if (score < CONSENSUS_INVALID_SCORE_THRESHOLD) {
    result = "invalid";
  }

  // 4. Apply penalties when consensus is clear
  let penaltiesApplied = 0;
  if (applyPenalties && result !== "partial") {
    const losingResult: VoteResult = result === "valid" ? "invalid" : "valid";
    const unpunishedLosers = votes.filter(
      (v) => v.result === losingResult && !v.penalty_applied
    );

    for (const loser of unpunishedLosers) {
      // Find the user_id from identity_nodes
      const nodeUser = await queryOne<{ user_id: string }>(
        `SELECT user_id FROM identity_nodes WHERE node_id = $1`,
        [loser.node_id]
      );
      if (nodeUser) {
        // Apply penalty
        await query(
          `UPDATE identity_nodes
           SET node_reputation = GREATEST(0, node_reputation + $1), updated_at = now()
           WHERE user_id = $2`,
          [PENALTY_DELTA, nodeUser.user_id]
        );

        // Mark vote as penalized
        await query(
          `UPDATE verification_votes SET penalty_applied = true WHERE id = $1`,
          [loser.id]
        );

        // Log penalty event
        const { logAgentEvent } = await import("./node");
        await logAgentEvent({
          userId: nodeUser.user_id,
          nodeId: loser.node_id,
          eventType: "consensus.penalty",
          reputationDelta: PENALTY_DELTA,
          metadata: {
            targetHash,
            votedResult: loser.result,
            consensusResult: result,
            penaltyDelta: PENALTY_DELTA,
          },
        });

        penaltiesApplied++;
      }
    }
  }

  return {
    targetHash,
    result,
    score,
    votes: {
      total: votes.length,
      valid: validCount,
      invalid: invalidCount,
      trustedNodes,
    },
    penaltiesApplied,
    computedAt: new Date().toISOString(),
  };
}

// ─── Get votes for a hash ─────────────────────────────────────────────────────

export async function getVotesForHash(targetHash: string): Promise<
  Array<{
    nodeId: string;
    result: VoteResult;
    weight: number;
    createdAt: string;
  }>
> {
  const rows = await query<{
    node_id: string;
    result: VoteResult;
    weight: number;
    created_at: string;
  }>(
    `SELECT node_id, result, weight, created_at
     FROM verification_votes
     WHERE target_hash = $1
     ORDER BY weight DESC, created_at ASC`,
    [targetHash]
  );

  return rows.map((r) => ({
    nodeId: r.node_id,
    result: r.result,
    weight: parseFloat(r.weight.toFixed(6)),
    createdAt: r.created_at,
  }));
}

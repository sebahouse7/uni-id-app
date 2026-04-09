/**
 * Light Consensus — uni.id (Hardened)
 *
 * Vote weight formula:
 *   weight = reputation × 0.6 + node_age_score × 0.2 + ln(endorsements+1) × 0.2
 *
 * Canonical payload (anti-replay):
 *   "vote::<node_id>::<target_hash>::<result>::<timestamp_ms>"
 *   timestamp window: ±60 seconds
 *
 * Node eligibility:
 *   reputation >= 1.2  AND  node_age >= 1 hour
 *
 * Consensus rules (top-20 votes by weight):
 *   "valid"   → trusted_nodes >= 3 AND score > 1.5
 *   "invalid" → score < -1.5
 *   "partial" → anything else
 *
 * Confidence:  min(1, |score| / 5)
 *
 * Proportional penalty (applied once, only when consensus is clear):
 *   penalty = min(0.5, voter_weight × 0.2)
 *
 * Collusion detection:
 *   ≥3 votes of the same result with timestamps within 5 s → suspicious_cluster
 *
 * Cache: 15-second in-memory TTL per target_hash (invalidated on new vote).
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
  timestamp_ms: number;
  created_at: string;
}

export interface ConsensusReport {
  targetHash: string;
  result: ConsensusResult;
  score: number;
  confidence: number;
  votes: {
    total: number;
    valid: number;
    invalid: number;
    trustedNodes: number;
    cappedAt: number | null;
  };
  suspiciousCluster: boolean;
  penaltiesApplied: number;
  computedAt: string;
}

export interface WeightBreakdown {
  reputation: number;
  reputationComponent: number;
  nodeAgeScore: number;
  ageComponent: number;
  totalEndorsements: number;
  endorsementComponent: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENSUS_VALID_SCORE    = 1.5;
const CONSENSUS_INVALID_SCORE  = -1.5;
const MIN_TRUSTED_NODES        = 3;
const TRUST_REP_THRESHOLD      = 2.0;
const MIN_REPUTATION_TO_VOTE   = 1.2;
const MIN_AGE_TO_VOTE_MS       = 60 * 60 * 1000;      // 1 hour
const TIMESTAMP_WINDOW_MS      = 60 * 1000;            // ±60 s
const MAX_VOTES_PER_HASH       = 20;                   // anti-spam cap
const COLLUSION_WINDOW_MS      = 5_000;                // 5 s
const COLLUSION_MIN_CLUSTER    = 3;
const CONFIDENCE_DIVISOR       = 5;                    // |score| / 5 → 1.0 at score=5

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  report: ConsensusReport;
  expiresAt: number;
}
const consensusCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function cacheGet(key: string): ConsensusReport | null {
  const entry = consensusCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    consensusCache.delete(key);
    return null;
  }
  return entry.report;
}

function cacheSet(key: string, report: ConsensusReport): void {
  consensusCache.set(key, { report, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidate(targetHash: string): void {
  consensusCache.delete(targetHash);
}

// ─── Canonical payload ────────────────────────────────────────────────────────

/**
 * The client MUST sign exactly this string.
 * Format: "vote::<node_id>::<target_hash>::<result>::<timestamp_ms>"
 * timestamp_ms = Date.now() at the moment of signing (±60 s window on server).
 */
export function buildVotePayload(
  nodeId: string,
  targetHash: string,
  result: VoteResult,
  timestampMs: number
): string {
  return `vote::${nodeId}::${targetHash}::${result}::${timestampMs}`;
}

// ─── Timestamp validation ─────────────────────────────────────────────────────

export function validateTimestamp(timestampMs: number): void {
  const drift = Math.abs(Date.now() - timestampMs);
  if (drift > TIMESTAMP_WINDOW_MS) {
    const driftSec = Math.round(drift / 1000);
    throw new Error(
      `Timestamp fuera de la ventana válida (±60 s). Deriva detectada: ${driftSec} s. ` +
        "Asegurate de que tu dispositivo tenga la hora sincronizada."
    );
  }
}

// ─── Node eligibility ─────────────────────────────────────────────────────────

export async function checkNodeEligibility(nodeId: string): Promise<void> {
  const row = await queryOne<{ node_reputation: number; created_at: string }>(
    `SELECT node_reputation, created_at FROM identity_nodes WHERE node_id = $1`,
    [nodeId]
  );

  const rep = row?.node_reputation ?? 0;
  if (rep < MIN_REPUTATION_TO_VOTE) {
    throw new Error(
      `Reputación insuficiente para votar. Mínimo requerido: ${MIN_REPUTATION_TO_VOTE}. ` +
        `Tu reputación actual: ${rep.toFixed(3)}. ` +
        "Participá en la red para construir reputación."
    );
  }

  const ageMs = Date.now() - new Date(row?.created_at ?? 0).getTime();
  if (ageMs < MIN_AGE_TO_VOTE_MS) {
    const minsLeft = Math.ceil((MIN_AGE_TO_VOTE_MS - ageMs) / 60000);
    throw new Error(
      `Nodo demasiado nuevo para votar. Tiempo restante: ${minsLeft} min. ` +
        "El nodo debe tener al menos 1 hora de antigüedad."
    );
  }
}

// ─── Weight calculation ───────────────────────────────────────────────────────

function nodeAgeScore(createdAt: string | Date): number {
  const daysSince =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.min(1.0, daysSince / 365);
}

export async function calculateVoteWeight(nodeId: string): Promise<{
  weight: number;
  breakdown: WeightBreakdown;
}> {
  const nodeRow = await queryOne<{
    node_reputation: number;
    created_at: string;
  }>(
    `SELECT node_reputation, created_at FROM identity_nodes WHERE node_id = $1`,
    [nodeId]
  );

  const reputation = nodeRow?.node_reputation ?? 1.0;
  const age = nodeAgeScore(nodeRow?.created_at ?? new Date().toISOString());

  const endorsementsRow = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM node_endorsements WHERE to_node_id = $1`,
    [nodeId]
  );
  const totalEndorsements = parseInt(endorsementsRow?.cnt ?? "0", 10);

  const reputationComponent  = reputation * 0.6;
  const ageComponent         = age * 0.2;
  const endorsementComponent = Math.log(totalEndorsements + 1) * 0.2;
  const weight               = reputationComponent + ageComponent + endorsementComponent;

  return {
    weight: parseFloat(weight.toFixed(6)),
    breakdown: {
      reputation,
      reputationComponent: parseFloat(reputationComponent.toFixed(6)),
      nodeAgeScore: parseFloat(age.toFixed(6)),
      ageComponent: parseFloat(ageComponent.toFixed(6)),
      totalEndorsements,
      endorsementComponent: parseFloat(endorsementComponent.toFixed(6)),
    },
  };
}

// ─── Collusion detection ──────────────────────────────────────────────────────

function detectCollusion(
  votes: Array<{ result: VoteResult; timestamp_ms: number }>
): boolean {
  // Check each result side separately: if ≥ COLLUSION_MIN_CLUSTER votes of
  // the same result fall within a COLLUSION_WINDOW_MS sliding window → flag.
  for (const side of ["valid", "invalid"] as VoteResult[]) {
    const sideTs = votes
      .filter((v) => v.result === side)
      .map((v) => v.timestamp_ms)
      .sort((a, b) => a - b);

    for (let i = 0; i + COLLUSION_MIN_CLUSTER - 1 < sideTs.length; i++) {
      const window =
        sideTs[i + COLLUSION_MIN_CLUSTER - 1]! - sideTs[i]!;
      if (window <= COLLUSION_WINDOW_MS) {
        return true;
      }
    }
  }
  return false;
}

// ─── Cast vote ────────────────────────────────────────────────────────────────

export async function castVote(params: {
  userId: string;
  targetHash: string;
  result: VoteResult;
  signature: string;
  timestampMs: number;
  ip?: string | null;
}): Promise<{
  vote: VerificationVote;
  weight: number;
  weightBreakdown: WeightBreakdown;
}> {
  const { userId, targetHash, result, signature, timestampMs, ip } = params;

  // 1. Validate timestamp window (anti-replay)
  validateTimestamp(timestampMs);

  // 2. Resolve the voting node
  const node = await getOrSyncNode(userId);
  if (!node?.node_id || !node.public_key) {
    throw new Error(
      "Tu nodo no tiene clave pública registrada. " +
        "Registrá tu clave de firma para participar en el consenso."
    );
  }

  // 3. Check node eligibility (reputation + age)
  await checkNodeEligibility(node.node_id);

  // 4. Build and verify canonical payload
  const canonical = buildVotePayload(node.node_id, targetHash, result, timestampMs);
  const valid = verifyEd25519(canonical, signature, node.public_key);
  if (!valid) {
    throw new Error(
      `Firma inválida. Debés firmar exactamente: "${canonical}"`
    );
  }

  // 5. Calculate weight
  const { weight, breakdown } = await calculateVoteWeight(node.node_id);

  // 6. Insert — UNIQUE(node_id, target_hash) prevents double vote
  const row = await queryOne<VerificationVote>(
    `INSERT INTO verification_votes
       (node_id, target_hash, result, signature, canonical_payload, weight, timestamp_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, node_id, target_hash, result, signature, canonical_payload,
               weight, penalty_applied, timestamp_ms, created_at`,
    [node.node_id, targetHash, result, signature, canonical, weight, timestampMs]
  );

  // 7. Invalidate cache for this hash
  cacheInvalidate(targetHash);

  // 8. Log agent event
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
    metadata: { targetHash, result, weight, timestampMs },
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
  timestamp_ms: number;
  node_reputation: number | null;
}

export async function computeConsensus(
  targetHash: string,
  applyPenalties = true,
  skipCache = false
): Promise<ConsensusReport> {
  // Cache hit (skip on dry-run so we always show live data)
  if (!skipCache && applyPenalties) {
    const cached = cacheGet(targetHash);
    if (cached) return cached;
  }

  // 1. Load votes ordered by weight DESC, take top MAX_VOTES_PER_HASH
  const allVotes = await query<VoteRow>(
    `SELECT v.id, v.node_id, v.result, v.weight, v.penalty_applied,
            v.timestamp_ms, n.node_reputation
     FROM verification_votes v
     LEFT JOIN identity_nodes n ON n.node_id = v.node_id
     WHERE v.target_hash = $1
     ORDER BY v.weight DESC, v.created_at ASC`,
    [targetHash]
  );

  const cappedAt = allVotes.length > MAX_VOTES_PER_HASH ? MAX_VOTES_PER_HASH : null;
  const votes = allVotes.slice(0, MAX_VOTES_PER_HASH);

  if (votes.length === 0) {
    return {
      targetHash,
      result: "partial",
      score: 0,
      confidence: 0,
      votes: { total: 0, valid: 0, invalid: 0, trustedNodes: 0, cappedAt: null },
      suspiciousCluster: false,
      penaltiesApplied: 0,
      computedAt: new Date().toISOString(),
    };
  }

  // 2. Aggregate
  let validWeight   = 0;
  let invalidWeight = 0;
  let trustedNodes  = 0;
  let validCount    = 0;
  let invalidCount  = 0;

  for (const v of votes) {
    const rep = v.node_reputation ?? 1.0;
    if (v.result === "valid") { validWeight += v.weight; validCount++; }
    else                      { invalidWeight += v.weight; invalidCount++; }
    if (rep >= TRUST_REP_THRESHOLD) trustedNodes++;
  }

  const score      = parseFloat((validWeight - invalidWeight).toFixed(6));
  const confidence = parseFloat(Math.min(1, Math.abs(score) / CONFIDENCE_DIVISOR).toFixed(4));

  // 3. Collusion detection
  const suspiciousCluster = detectCollusion(votes);

  // 4. Determine result
  let result: ConsensusResult = "partial";
  if (trustedNodes >= MIN_TRUSTED_NODES && score > CONSENSUS_VALID_SCORE) {
    result = "valid";
  } else if (score < CONSENSUS_INVALID_SCORE) {
    result = "invalid";
  }

  // 5. Proportional penalties
  let penaltiesApplied = 0;
  if (applyPenalties && result !== "partial") {
    const losingResult: VoteResult = result === "valid" ? "invalid" : "valid";
    const unpunished = votes.filter(
      (v) => v.result === losingResult && !v.penalty_applied
    );

    for (const loser of unpunished) {
      const nodeUser = await queryOne<{ user_id: string }>(
        `SELECT user_id FROM identity_nodes WHERE node_id = $1`,
        [loser.node_id]
      );
      if (!nodeUser) continue;

      // Proportional: stronger nodes pay more for being wrong
      const penalty = -Math.min(0.5, loser.weight * 0.2);

      await query(
        `UPDATE identity_nodes
         SET node_reputation = GREATEST(0, node_reputation + $1), updated_at = now()
         WHERE user_id = $2`,
        [penalty, nodeUser.user_id]
      );

      await query(
        `UPDATE verification_votes SET penalty_applied = true WHERE id = $1`,
        [loser.id]
      );

      const { logAgentEvent } = await import("./node");
      await logAgentEvent({
        userId: nodeUser.user_id,
        nodeId: loser.node_id,
        eventType: "consensus.penalty",
        reputationDelta: penalty,
        metadata: {
          targetHash,
          votedResult: loser.result,
          consensusResult: result,
          penaltyDelta: penalty,
          voterWeight: loser.weight,
        },
      });

      penaltiesApplied++;
    }
  }

  const report: ConsensusReport = {
    targetHash,
    result,
    score,
    confidence,
    votes: {
      total: allVotes.length,
      valid: validCount,
      invalid: invalidCount,
      trustedNodes,
      cappedAt,
    },
    suspiciousCluster,
    penaltiesApplied,
    computedAt: new Date().toISOString(),
  };

  // Cache only live (non-dry) results
  if (applyPenalties) cacheSet(targetHash, report);

  return report;
}

// ─── Get votes for a hash ─────────────────────────────────────────────────────

export async function getVotesForHash(targetHash: string): Promise<
  Array<{
    nodeId: string;
    result: VoteResult;
    weight: number;
    timestampMs: number;
    createdAt: string;
  }>
> {
  const rows = await query<{
    node_id: string;
    result: VoteResult;
    weight: number;
    timestamp_ms: number;
    created_at: string;
  }>(
    `SELECT node_id, result, weight, timestamp_ms, created_at
     FROM verification_votes
     WHERE target_hash = $1
     ORDER BY weight DESC, created_at ASC`,
    [targetHash]
  );

  return rows.map((r) => ({
    nodeId: r.node_id,
    result: r.result,
    weight: parseFloat(r.weight.toFixed(6)),
    timestampMs: Number(r.timestamp_ms),
    createdAt: r.created_at,
  }));
}

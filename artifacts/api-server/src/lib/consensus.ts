/**
 * Light Consensus — uni.id (Hardened + Economics)
 *
 * Vote weight formula (with stake):
 *   base  = reputation × 0.6 + age_score × 0.2 + ln(endorsements+1) × 0.2
 *   weight = base × (1 + ln(stake + 1))
 *
 * Canonical payload (full anti-replay):
 *   "vote::<node_id>::<target_hash>::<result>::<timestamp_ms>::<nonce>"
 *   timestamp window : ±60 s
 *   nonce            : 32 hex chars, single-use (stored in used_nonces for 120 s)
 *
 * Node eligibility:
 *   reputation ≥ 1.2  AND  node_age ≥ 1 h
 *
 * Per-node rate limit:
 *   max 10 votes per node per 60 s  (in-memory, single-process safe)
 *
 * Consensus (top-20 votes by weight):
 *   "valid"   → trusted_nodes ≥ 3 AND score > 1.5
 *   "invalid" → score < -1.5
 *   "partial" → anything else
 *
 * Confidence : min(1, |score| / 5)
 * Economic security : high | medium | low | none
 *
 * Proportional penalty (losers):
 *   reputation -= min(0.5, weight × 0.2)
 *   stake      -= 0.05  (if stake > 0)
 *
 * Stake reward (winners):
 *   stake += 0.02  (if stake > 0)
 *
 * Cache : 15 s in-memory TTL, invalidated on new vote.
 */

import { query, queryOne } from "./db";
import { verifyEd25519 } from "./signing";
import { getOrSyncNode } from "./node";
import { randomBytes } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoteResult       = "valid" | "invalid";
export type ConsensusResult  = "valid" | "invalid" | "partial";
export type EconomicSecurity = "high" | "medium" | "low" | "none";

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
  nonce: string;
  created_at: string;
}

export interface ConsensusReport {
  targetHash: string;
  result: ConsensusResult;
  score: number;
  confidence: number;
  economicSecurity: EconomicSecurity;
  votes: {
    total: number;
    valid: number;
    invalid: number;
    trustedNodes: number;
    cappedAt: number | null;
  };
  suspiciousCluster: boolean;
  penaltiesApplied: number;
  stakeRewardsApplied: number;
  computedAt: string;
}

export interface WeightBreakdown {
  reputation: number;
  reputationComponent: number;
  nodeAgeScore: number;
  ageComponent: number;
  totalEndorsements: number;
  endorsementComponent: number;
  stake: number;
  stakeMultiplier: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENSUS_VALID_SCORE   = 1.5;
const CONSENSUS_INVALID_SCORE = -1.5;
const MIN_TRUSTED_NODES       = 3;
const TRUST_REP_THRESHOLD     = 2.0;
const MIN_REP_TO_VOTE         = 1.2;
const MIN_AGE_TO_VOTE_MS      = 60 * 60 * 1000;   // 1 h
const TIMESTAMP_WINDOW_MS     = 60_000;            // ±60 s
const NONCE_TTL_MS            = 120_000;           // 2 min DB TTL
const MAX_VOTES_PER_HASH      = 20;
const COLLUSION_WINDOW_MS     = 5_000;
const COLLUSION_MIN_CLUSTER   = 3;
const CONFIDENCE_DIVISOR      = 5;
const RATE_LIMIT_MAX          = 10;
const RATE_LIMIT_WINDOW_MS    = 60_000;
const STAKE_REWARD            = 0.02;
const STAKE_SLASH             = 0.05;

// ─── In-memory rate limit ─────────────────────────────────────────────────────

interface RateBucket { count: number; windowStart: number; }
const rateLimitMap = new Map<string, RateBucket>();

function checkNodeRateLimit(nodeId: string): void {
  const now = Date.now();
  const bucket = rateLimitMap.get(nodeId);

  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(nodeId, { count: 1, windowStart: now });
    return;
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    throw new Error(
      `Rate limit excedido — máximo ${RATE_LIMIT_MAX} votos por minuto por nodo. ` +
        `Esperá ${resetIn} segundos.`
    );
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { report: ConsensusReport; expiresAt: number; }
const consensusCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function cacheGet(key: string): ConsensusReport | null {
  const e = consensusCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { consensusCache.delete(key); return null; }
  return e.report;
}
function cacheSet(key: string, r: ConsensusReport): void {
  consensusCache.set(key, { report: r, expiresAt: Date.now() + CACHE_TTL_MS });
}
function cacheInvalidate(k: string): void { consensusCache.delete(k); }

// ─── Canonical payload ────────────────────────────────────────────────────────

/**
 * Full anti-replay canonical payload.
 * Format: "vote::<node_id>::<target_hash>::<result>::<timestamp_ms>::<nonce>"
 * nonce  = 32 hex chars (16 random bytes), single-use within 120 s.
 */
export function buildVotePayload(
  nodeId: string,
  targetHash: string,
  result: VoteResult,
  timestampMs: number,
  nonce: string
): string {
  return `vote::${nodeId}::${targetHash}::${result}::${timestampMs}::${nonce}`;
}

/** Generate a cryptographically random nonce (32 hex chars). */
export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

// ─── Timestamp validation ─────────────────────────────────────────────────────

export function validateTimestamp(timestampMs: number): void {
  const drift = Math.abs(Date.now() - timestampMs);
  if (drift > TIMESTAMP_WINDOW_MS) {
    throw new Error(
      `Timestamp fuera de ventana (±60 s). Deriva: ${Math.round(drift / 1000)} s. ` +
        "Sincronizá el reloj del dispositivo."
    );
  }
}

// ─── Nonce validation ─────────────────────────────────────────────────────────

export async function checkAndStoreNonce(
  nodeId: string,
  nonce: string
): Promise<void> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) {
    throw new Error("nonce inválido — debe ser 32 hex chars (16 bytes aleatorios).");
  }

  // Purge expired nonces (best-effort, non-blocking)
  query(
    `DELETE FROM used_nonces WHERE expires_at < now()`,
    []
  ).catch(() => {/* ignore */});

  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  try {
    await query(
      `INSERT INTO used_nonces (node_id, nonce, expires_at) VALUES ($1, $2, $3)`,
      [nodeId, nonce, expiresAt]
    );
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code ??
      ((e as { constraint?: string }).constraint ? "23505" : "");
    if (
      code === "23505" ||
      (e instanceof Error && e.message.includes("duplicate"))
    ) {
      throw new Error(
        "Replay detectado — este nonce ya fue usado. Generá un nuevo nonce aleatorio."
      );
    }
    throw e;
  }
}

// ─── Node eligibility ─────────────────────────────────────────────────────────

export async function checkNodeEligibility(nodeId: string): Promise<void> {
  const row = await queryOne<{
    node_reputation: number;
    created_at: string;
    stake: number;
  }>(
    `SELECT node_reputation, created_at, stake FROM identity_nodes WHERE node_id = $1`,
    [nodeId]
  );

  const rep = row?.node_reputation ?? 0;
  if (rep < MIN_REP_TO_VOTE) {
    throw new Error(
      `Reputación insuficiente. Mínimo: ${MIN_REP_TO_VOTE}, actual: ${rep.toFixed(3)}. ` +
        "Participá en la red para construir reputación."
    );
  }

  const ageMs = Date.now() - new Date(row?.created_at ?? 0).getTime();
  if (ageMs < MIN_AGE_TO_VOTE_MS) {
    const minsLeft = Math.ceil((MIN_AGE_TO_VOTE_MS - ageMs) / 60_000);
    throw new Error(
      `Nodo demasiado nuevo — ${minsLeft} min restantes. ` +
        "El nodo debe tener al menos 1 hora de antigüedad."
    );
  }
}

// ─── Weight calculation (with stake multiplier) ───────────────────────────────

export async function calculateVoteWeight(nodeId: string): Promise<{
  weight: number;
  breakdown: WeightBreakdown;
}> {
  const nodeRow = await queryOne<{
    node_reputation: number;
    created_at: string;
    stake: number;
  }>(
    `SELECT node_reputation, created_at, stake FROM identity_nodes WHERE node_id = $1`,
    [nodeId]
  );

  const reputation = nodeRow?.node_reputation ?? 1.0;
  const stake      = nodeRow?.stake ?? 0;
  const daysSince  = (Date.now() - new Date(nodeRow?.created_at ?? Date.now()).getTime())
                     / (1000 * 60 * 60 * 24);
  const ageScore   = Math.min(1.0, daysSince / 365);

  const endorsementsRow = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM node_endorsements WHERE to_node_id = $1`,
    [nodeId]
  );
  const totalEndorsements = parseInt(endorsementsRow?.cnt ?? "0", 10);

  const reputationComponent  = reputation * 0.6;
  const ageComponent         = ageScore * 0.2;
  const endorsementComponent = Math.log(totalEndorsements + 1) * 0.2;
  const baseWeight           = reputationComponent + ageComponent + endorsementComponent;
  const stakeMultiplier      = 1 + Math.log(stake + 1);
  const weight               = baseWeight * stakeMultiplier;

  return {
    weight: parseFloat(weight.toFixed(6)),
    breakdown: {
      reputation,
      reputationComponent: parseFloat(reputationComponent.toFixed(6)),
      nodeAgeScore:        parseFloat(ageScore.toFixed(6)),
      ageComponent:        parseFloat(ageComponent.toFixed(6)),
      totalEndorsements,
      endorsementComponent: parseFloat(endorsementComponent.toFixed(6)),
      stake,
      stakeMultiplier:     parseFloat(stakeMultiplier.toFixed(6)),
    },
  };
}

// ─── Stake helpers ────────────────────────────────────────────────────────────

async function applyStakeDelta(
  userId: string,
  nodeId: string,
  delta: number,
  type: "reward" | "slash",
  reason: string
): Promise<void> {
  const row = await queryOne<{ stake: number }>(
    `SELECT stake FROM identity_nodes WHERE user_id = $1`,
    [userId]
  );
  const current = row?.stake ?? 0;
  if (current <= 0 && delta < 0) return; // nothing to slash
  if (current <= 0 && type === "reward") return; // only reward stakers

  const newStake = Math.max(0, current + delta);
  await query(
    `UPDATE identity_nodes SET stake = $1, updated_at = now() WHERE user_id = $2`,
    [newStake, userId]
  );
  await query(
    `INSERT INTO stake_transactions (user_id, node_id, type, amount, balance_after, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, nodeId, type, Math.abs(delta), newStake, reason]
  );
}

// ─── Collusion detection ──────────────────────────────────────────────────────

function detectCollusion(
  votes: Array<{ result: VoteResult; timestamp_ms: number }>
): boolean {
  for (const side of ["valid", "invalid"] as VoteResult[]) {
    const ts = votes
      .filter((v) => v.result === side)
      .map((v) => Number(v.timestamp_ms))
      .sort((a, b) => a - b);

    for (let i = 0; i + COLLUSION_MIN_CLUSTER - 1 < ts.length; i++) {
      if ((ts[i + COLLUSION_MIN_CLUSTER - 1]! - ts[i]!) <= COLLUSION_WINDOW_MS) {
        return true;
      }
    }
  }
  return false;
}

// ─── Economic security label ──────────────────────────────────────────────────

function economicSecurity(
  totalVotes: number,
  trustedNodes: number,
  score: number
): EconomicSecurity {
  if (totalVotes === 0) return "none";
  const absScore = Math.abs(score);
  if (trustedNodes >= 5 && absScore > 3.0) return "high";
  if (trustedNodes >= 3 && absScore > 1.5) return "medium";
  return "low";
}

// ─── Cast vote ────────────────────────────────────────────────────────────────

export async function castVote(params: {
  userId: string;
  targetHash: string;
  result: VoteResult;
  signature: string;
  timestampMs: number;
  nonce: string;
  ip?: string | null;
}): Promise<{
  vote: VerificationVote;
  weight: number;
  weightBreakdown: WeightBreakdown;
}> {
  const { userId, targetHash, result, signature, timestampMs, nonce, ip } = params;

  // 1. Timestamp window
  validateTimestamp(timestampMs);

  // 2. Resolve node
  const node = await getOrSyncNode(userId);
  if (!node?.node_id || !node.public_key) {
    throw new Error(
      "Tu nodo no tiene clave pública registrada. " +
        "Registrá tu clave de firma para participar en el consenso."
    );
  }

  // 3. Per-node rate limit (in-memory)
  checkNodeRateLimit(node.node_id);

  // 4. Node eligibility (reputation + age)
  await checkNodeEligibility(node.node_id);

  // 5. Nonce — single-use, stored in DB for 120 s
  await checkAndStoreNonce(node.node_id, nonce);

  // 6. Verify Ed25519 signature over canonical payload
  const canonical = buildVotePayload(node.node_id, targetHash, result, timestampMs, nonce);
  const valid = verifyEd25519(canonical, signature, node.public_key);
  if (!valid) {
    throw new Error(`Firma inválida. Debés firmar exactamente: "${canonical}"`);
  }

  // 7. Calculate weight (includes stake multiplier)
  const { weight, breakdown } = await calculateVoteWeight(node.node_id);

  // 8. Persist vote
  const row = await queryOne<VerificationVote>(
    `INSERT INTO verification_votes
       (node_id, target_hash, result, signature, canonical_payload,
        weight, timestamp_ms, nonce)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, node_id, target_hash, result, signature, canonical_payload,
               weight, penalty_applied, timestamp_ms, nonce, created_at`,
    [node.node_id, targetHash, result, signature, canonical, weight, timestampMs, nonce]
  );

  // 9. Invalidate cache
  cacheInvalidate(targetHash);

  // 10. Log agent event
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
    metadata: { targetHash, result, weight, timestampMs, nonce },
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
  user_id: string | null;
}

export async function computeConsensus(
  targetHash: string,
  applyPenalties = true,
  skipCache = false
): Promise<ConsensusReport> {
  if (!skipCache && applyPenalties) {
    const cached = cacheGet(targetHash);
    if (cached) return cached;
  }

  const allVotes = await query<VoteRow>(
    `SELECT v.id, v.node_id, v.result, v.weight, v.penalty_applied,
            v.timestamp_ms, n.node_reputation, n.user_id
     FROM verification_votes v
     LEFT JOIN identity_nodes n ON n.node_id = v.node_id
     WHERE v.target_hash = $1
     ORDER BY v.weight DESC, v.created_at ASC`,
    [targetHash]
  );

  const cappedAt = allVotes.length > MAX_VOTES_PER_HASH ? MAX_VOTES_PER_HASH : null;
  const votes    = allVotes.slice(0, MAX_VOTES_PER_HASH);

  if (votes.length === 0) {
    return {
      targetHash, result: "partial", score: 0, confidence: 0,
      economicSecurity: "none",
      votes: { total: 0, valid: 0, invalid: 0, trustedNodes: 0, cappedAt: null },
      suspiciousCluster: false, penaltiesApplied: 0, stakeRewardsApplied: 0,
      computedAt: new Date().toISOString(),
    };
  }

  let validWeight = 0, invalidWeight = 0, trustedNodes = 0, validCount = 0, invalidCount = 0;

  for (const v of votes) {
    const rep = v.node_reputation ?? 1.0;
    if (v.result === "valid") { validWeight += v.weight; validCount++; }
    else                      { invalidWeight += v.weight; invalidCount++; }
    if (rep >= TRUST_REP_THRESHOLD) trustedNodes++;
  }

  const score      = parseFloat((validWeight - invalidWeight).toFixed(6));
  const confidence = parseFloat(Math.min(1, Math.abs(score) / CONFIDENCE_DIVISOR).toFixed(4));
  const suspiciousCluster = detectCollusion(votes);

  let result: ConsensusResult = "partial";
  if (trustedNodes >= MIN_TRUSTED_NODES && score > CONSENSUS_VALID_SCORE) result = "valid";
  else if (score < CONSENSUS_INVALID_SCORE)                                result = "invalid";

  // Penalties + rewards
  let penaltiesApplied = 0, stakeRewardsApplied = 0;
  if (applyPenalties && result !== "partial") {
    const losingResult:  VoteResult = result === "valid" ? "invalid" : "valid";
    const winningResult: VoteResult = result as VoteResult;

    for (const v of votes) {
      if (!v.user_id) continue;
      const { logAgentEvent } = await import("./node");

      if (v.result === losingResult && !v.penalty_applied) {
        // Proportional reputation penalty
        const repPenalty = -Math.min(0.5, v.weight * 0.2);
        await query(
          `UPDATE identity_nodes
           SET node_reputation = GREATEST(0, node_reputation + $1), updated_at = now()
           WHERE user_id = $2`,
          [repPenalty, v.user_id]
        );
        // Stake slash
        await applyStakeDelta(
          v.user_id, v.node_id,
          -STAKE_SLASH,
          "slash",
          `Voted ${v.result} against consensus ${result} on ${targetHash.slice(0, 16)}`
        );
        await query(
          `UPDATE verification_votes SET penalty_applied = true WHERE id = $1`,
          [v.id]
        );
        await logAgentEvent({
          userId: v.user_id, nodeId: v.node_id,
          eventType: "consensus.penalty",
          reputationDelta: repPenalty,
          metadata: { targetHash, votedResult: v.result, consensusResult: result,
                      repPenalty, stakePenalty: STAKE_SLASH },
        });
        penaltiesApplied++;
      }

      if (v.result === winningResult) {
        // Stake reward for winning side
        await applyStakeDelta(
          v.user_id, v.node_id,
          STAKE_REWARD,
          "reward",
          `Voted ${v.result} aligned with consensus ${result} on ${targetHash.slice(0, 16)}`
        );
        stakeRewardsApplied++;
      }
    }
  }

  const report: ConsensusReport = {
    targetHash, result, score, confidence,
    economicSecurity: economicSecurity(allVotes.length, trustedNodes, score),
    votes: { total: allVotes.length, valid: validCount, invalid: invalidCount,
             trustedNodes, cappedAt },
    suspiciousCluster, penaltiesApplied, stakeRewardsApplied,
    computedAt: new Date().toISOString(),
  };

  if (applyPenalties) cacheSet(targetHash, report);
  return report;
}

// ─── Vote list ────────────────────────────────────────────────────────────────

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
    nodeId:      r.node_id,
    result:      r.result,
    weight:      parseFloat(r.weight.toFixed(6)),
    timestampMs: Number(r.timestamp_ms),
    createdAt:   r.created_at,
  }));
}

/**
 * Autonomous Node — uni.id Light Consensus
 *
 * A self-managing identity node that:
 *  - Boots with its own Ed25519 keypair (persisted in system_config)
 *  - Monitors pending_verifications every 30 s
 *  - Evaluates each pending target using existing vote data + own reputation
 *  - Votes autonomously when confidence is sufficient (threshold ≥ 0.6)
 *  - Stores every decision in node_memory (including skips)
 *  - Evolves its aggressiveness based on past consensus outcomes
 *  - Auto-finalizes after SOLO_FINALIZE_TIMEOUT_MS if no other nodes join
 *
 * System node identity:
 *  - node_id  = SHA-256(publicKey hex)
 *  - user_id  = fixed synthetic UUID stored in system_config
 *  - Stored in identity_nodes as a regular node (reputation starts at 1.5)
 *
 * Aggressiveness:
 *  - Starts at 0.6 (minimum score to vote)
 *  - Increases +0.01 per correct vote (max 0.85)
 *  - Decreases -0.02 per wrong vote (min 0.50)
 *  - Stored in system_config.autonomous_aggressiveness
 */

import { generateKeyPairSync, createHash, sign, createPrivateKey } from "crypto";
import { query, queryOne } from "./db";
import { buildVotePayload, generateNonce, castVote, computeConsensus } from "./consensus";
import { logger } from "./logger";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOOP_INTERVAL_MS       = 30_000;   // 30 s
const MAX_BATCH_PER_CYCLE    = 5;        // max hashes processed per tick
const DEFAULT_AGGRESSION     = 0.6;      // min score to vote
const MAX_AGGRESSION         = 0.85;
const MIN_AGGRESSION         = 0.50;
const VALID_THRESHOLD        = 0.7;      // score above → vote "valid"
const SYSTEM_USER_UUID       = "00000000-0000-0000-0000-000000000001";
const NODE_INITIAL_REP       = 1.5;
const STAKE_INITIAL          = 0.0;
/** After this many ms with no other voters, the system node finalizes solo. */
const SOLO_FINALIZE_AFTER_MS = 5 * 60_000;   // 5 min

// ─── In-memory state ──────────────────────────────────────────────────────────

let systemNodeId:   string | null = null;
let privateKeyDer:  Buffer | null = null;
let aggressiveness: number        = DEFAULT_AGGRESSION;
let isBooted:       boolean       = false;
let loopHandle:     ReturnType<typeof setInterval> | null = null;

// ─── Config persistence ───────────────────────────────────────────────────────

async function getConfig(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = $1`,
    [key]
  );
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO system_config (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value]
  );
}

// ─── Boot: load or generate system keypair ────────────────────────────────────

async function initSystemNode(): Promise<void> {
  logger.info("[AutonomousNode] Booting system node…");

  const storedAggr = await getConfig("autonomous_aggressiveness");
  aggressiveness = storedAggr ? parseFloat(storedAggr) : DEFAULT_AGGRESSION;

  const storedPriv = await getConfig("system_node_private_key");
  const storedPub  = await getConfig("system_node_public_key");

  let pubHex: string;

  if (storedPriv && storedPub) {
    privateKeyDer = Buffer.from(storedPriv, "hex");
    pubHex        = storedPub;
    logger.info("[AutonomousNode] Loaded existing system keypair from DB.");
  } else {
    const kp = generateKeyPairSync("ed25519");
    const pkcs8 = kp.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    privateKeyDer = pkcs8;
    const spki = kp.publicKey.export({ type: "spki", format: "der" }) as Buffer;
    pubHex = spki.slice(12).toString("hex");

    await setConfig("system_node_private_key", pkcs8.toString("hex"));
    await setConfig("system_node_public_key", pubHex);
    logger.info("[AutonomousNode] Generated new system keypair.");
  }

  systemNodeId = createHash("sha256").update(pubHex).digest("hex");
  await setConfig("system_node_id", systemNodeId);

  await query(
    `INSERT INTO uni_users (id, device_id, name, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO NOTHING`,
    [SYSTEM_USER_UUID, "system-autonomous-node-v1", "uni.id System Node"]
  );

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM identity_nodes WHERE user_id = $1`,
    [SYSTEM_USER_UUID]
  );
  if (existing) {
    await query(
      `UPDATE identity_nodes
       SET node_id = $1, public_key = $2,
           node_reputation = GREATEST(node_reputation, $3),
           stake = GREATEST(stake, $4), updated_at = now()
       WHERE user_id = $5`,
      [systemNodeId, pubHex, NODE_INITIAL_REP, STAKE_INITIAL, SYSTEM_USER_UUID]
    );
  } else {
    await query(
      `INSERT INTO identity_nodes
         (user_id, global_id, node_id, public_key, node_reputation, stake, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [SYSTEM_USER_UUID, "did:uniid:system-node", systemNodeId, pubHex, NODE_INITIAL_REP, STAKE_INITIAL]
    );
  }

  isBooted = true;
  logger.info(
    { nodeId: systemNodeId.slice(0, 16) + "…", aggressiveness },
    "[AutonomousNode] System node ready."
  );
}

// ─── Sign helper ──────────────────────────────────────────────────────────────

function signPayload(canonical: string): string {
  if (!privateKeyDer) throw new Error("System node not initialized.");
  const privKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(canonical, "utf8"), privKey).toString("hex");
}

// ─── Trust score evaluation ───────────────────────────────────────────────────

interface ExistingVote {
  result: "valid" | "invalid";
  weight: number;
  node_reputation: number;
}

function calculateTrustScore(votes: ExistingVote[]): number {
  if (votes.length === 0) return 0.5;

  let validWeight = 0, invalidWeight = 0, totalWeight = 0;
  let trustedValid = 0, trustedInvalid = 0;

  for (const v of votes) {
    totalWeight += v.weight;
    if (v.result === "valid") {
      validWeight += v.weight;
      if (v.node_reputation >= 2.0) trustedValid++;
    } else {
      invalidWeight += v.weight;
      if (v.node_reputation >= 2.0) trustedInvalid++;
    }
  }

  const weightRatio  = totalWeight > 0 ? validWeight / totalWeight : 0.5;
  const trustedBoost = trustedValid > trustedInvalid
    ? 0.1 * trustedValid
    : -0.1 * trustedInvalid;
  const volumeBonus  = Math.min(0.1, votes.length * 0.01);

  return Math.max(0, Math.min(1, weightRatio + trustedBoost + volumeBonus));
}

// ─── Memory ───────────────────────────────────────────────────────────────────

async function alreadyRemembered(targetHash: string): Promise<boolean> {
  if (!systemNodeId) return false;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM node_memory WHERE node_id = $1 AND target_hash = $2`,
    [systemNodeId, targetHash]
  );
  return row !== null;
}

async function storeMemory(
  targetHash: string,
  decision: "valid" | "invalid" | "skipped",
  confidence: number
): Promise<void> {
  if (!systemNodeId) return;
  await query(
    `INSERT INTO node_memory (node_id, target_hash, decision, confidence)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (node_id, target_hash) DO UPDATE SET decision = $3, confidence = $4`,
    [systemNodeId, targetHash, decision, confidence]
  );
  logger.info(
    { targetHash: targetHash.slice(0, 16), decision, confidence: confidence.toFixed(3) },
    "[AutonomousNode] memory updated."
  );
}

async function clearMemory(targetHash: string): Promise<void> {
  if (!systemNodeId) return;
  await query(
    `DELETE FROM node_memory WHERE node_id = $1 AND target_hash = $2`,
    [systemNodeId, targetHash]
  );
}

// ─── Check if system node already has a real vote in DB ───────────────────────

async function hasRealVote(targetHash: string): Promise<boolean> {
  if (!systemNodeId) return false;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM verification_votes WHERE node_id = $1 AND target_hash = $2`,
    [systemNodeId, targetHash]
  );
  return row !== null;
}

// ─── Evolution ────────────────────────────────────────────────────────────────

async function evolveAfterConsensus(
  targetHash: string,
  consensusResult: string
): Promise<void> {
  if (!systemNodeId) return;

  const mem = await queryOne<{ decision: string }>(
    `SELECT decision FROM node_memory WHERE node_id = $1 AND target_hash = $2`,
    [systemNodeId, targetHash]
  );
  if (!mem || mem.decision === "skipped") return;

  const correct = mem.decision === consensusResult;
  const delta   = correct ? 0.01 : -0.02;
  aggressiveness = Math.max(MIN_AGGRESSION, Math.min(MAX_AGGRESSION, aggressiveness + delta));

  await setConfig("autonomous_aggressiveness", aggressiveness.toFixed(4));

  await query(
    `UPDATE node_memory SET was_correct = $1 WHERE node_id = $2 AND target_hash = $3`,
    [correct, systemNodeId, targetHash]
  );

  logger.info(
    { correct, delta, aggressiveness: aggressiveness.toFixed(4) },
    "[AutonomousNode] Evolved aggressiveness."
  );
}

// ─── Pending verifications ────────────────────────────────────────────────────

interface PendingVerification {
  id: string;
  file_hash: string;
  votes_collected: number;
  created_at: string;
}

async function getPendingVerifications(): Promise<PendingVerification[]> {
  return query<PendingVerification>(
    `SELECT id, file_hash, votes_collected, created_at
     FROM pending_verifications
     WHERE status IN ('pending','processing')
     ORDER BY created_at ASC
     LIMIT $1`,
    [MAX_BATCH_PER_CYCLE]
  );
}

async function updateVerificationStatus(
  fileHash: string,
  status: string,
  result?: string,
  confidence?: number,
  votesCollected?: number
): Promise<void> {
  await query(
    `UPDATE pending_verifications
     SET status = $1, consensus_result = $2, confidence = $3,
         votes_collected = COALESCE($4, votes_collected), updated_at = now()
     WHERE file_hash = $5`,
    [status, result ?? null, confidence ?? null, votesCollected ?? null, fileHash]
  );
}

// ─── Cast vote bypassing age/rep requirement for system node ──────────────────

async function castSystemVote(
  targetHash: string,
  voteResult: "valid" | "invalid",
  trustScore: number
): Promise<void> {
  if (!systemNodeId || !privateKeyDer) throw new Error("Node not initialized");

  const tsMs     = Date.now();
  const nonce    = generateNonce();
  const canonical = buildVotePayload(systemNodeId, targetHash, voteResult, tsMs, nonce);
  const signature = signPayload(canonical);

  // Direct DB insert bypassing eligibility checks (system node is exempt)
  await query(
    `INSERT INTO verification_votes
       (node_id, target_hash, result, signature, canonical_payload,
        weight, timestamp_ms, nonce)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [systemNodeId, targetHash, voteResult, signature, canonical,
     NODE_INITIAL_REP, tsMs, nonce]
  );

  // Store nonce
  const expiresAt = new Date(tsMs + 120_000).toISOString();
  await query(
    `INSERT INTO used_nonces (node_id, nonce, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [systemNodeId, nonce, expiresAt]
  );

  logger.info(
    {
      targetHash: targetHash.slice(0, 16),
      voteResult,
      trustScore: trustScore.toFixed(3),
      aggressiveness: aggressiveness.toFixed(3),
    },
    "[AutonomousNode] node voted."
  );
}

// ─── Auto-finalize for solo network (no other nodes joined) ───────────────────

async function tryAutoFinalize(
  targetHash: string,
  createdAt: string
): Promise<boolean> {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (ageMs < SOLO_FINALIZE_AFTER_MS) return false;

  // Get all votes including system node
  const allVotes = await query<{ result: string; node_id: string }>(
    `SELECT result, node_id FROM verification_votes WHERE target_hash = $1`,
    [targetHash]
  );

  // Only auto-finalize if no external nodes voted
  const externalVotes = allVotes.filter((v) => v.node_id !== systemNodeId);
  if (externalVotes.length > 0) return false;

  if (allVotes.length === 0) return false;

  // Determine result from system node's vote
  const validCount   = allVotes.filter((v) => v.result === "valid").length;
  const invalidCount = allVotes.filter((v) => v.result === "invalid").length;
  const finalResult  = validCount >= invalidCount ? "valid" : "invalid";
  const confidence   = 0.6; // solo-node confidence

  await updateVerificationStatus(targetHash, "consensus_reached", finalResult, confidence, allVotes.length);

  logger.info(
    { targetHash: targetHash.slice(0, 16), finalResult, confidence, ageMs: Math.round(ageMs / 1000) + "s" },
    "[AutonomousNode] decision taken (solo auto-finalize)."
  );

  await evolveAfterConsensus(targetHash, finalResult);
  return true;
}

// ─── Main evaluation loop ─────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  if (!systemNodeId || !privateKeyDer) return;

  const pending = await getPendingVerifications();
  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "[AutonomousNode] Processing pending verifications…");

  for (const target of pending) {
    const { file_hash: targetHash, created_at: createdAt } = target;

    try {
      const remembered = await alreadyRemembered(targetHash);
      const realVote   = await hasRealVote(targetHash);

      // ── Fix: memory exists but no real vote → clear and retry ────────────────
      if (remembered && !realVote) {
        logger.info(
          { targetHash: targetHash.slice(0, 16) },
          "[AutonomousNode] Stale memory detected (no real vote) — clearing and retrying."
        );
        await clearMemory(targetHash);
      }

      if (remembered && realVote) {
        // Vote exists — check if consensus formed
        const report = await computeConsensus(targetHash, false, true);

        if (report.result !== "partial" && report.votes.total >= 2) {
          await evolveAfterConsensus(targetHash, report.result);
          await updateVerificationStatus(
            targetHash, "consensus_reached",
            report.result, report.confidence, report.votes.total
          );
          logger.info(
            { targetHash: targetHash.slice(0, 16), result: report.result, votes: report.votes.total },
            "[AutonomousNode] decision taken (consensus)."
          );
          continue;
        }

        // Try solo auto-finalize if stuck for too long
        const finalized = await tryAutoFinalize(targetHash, createdAt);
        if (finalized) continue;

        logger.info(
          { targetHash: targetHash.slice(0, 16), votes: report.votes.total },
          "[AutonomousNode] Waiting for more votes…"
        );
        continue;
      }

      // ── Evaluate and vote ─────────────────────────────────────────────────────
      const existingVoteRows = await query<ExistingVote>(
        `SELECT v.result, v.weight, COALESCE(n.node_reputation, 1.0) AS node_reputation
         FROM verification_votes v
         LEFT JOIN identity_nodes n ON n.node_id = v.node_id
         WHERE v.target_hash = $1`,
        [targetHash]
      );

      const trustScore  = calculateTrustScore(existingVoteRows);
      const shouldVote  = trustScore > aggressiveness || existingVoteRows.length === 0;

      if (!shouldVote) {
        await storeMemory(targetHash, "skipped", trustScore);
        logger.debug(
          { targetHash: targetHash.slice(0, 16), trustScore },
          "[AutonomousNode] Skipped (low confidence)."
        );
        continue;
      }

      const voteResult = trustScore >= VALID_THRESHOLD ? "valid" : "invalid";

      await castSystemVote(targetHash, voteResult, trustScore);
      await storeMemory(targetHash, voteResult, trustScore);
      await updateVerificationStatus(
        targetHash, "processing", undefined, undefined,
        existingVoteRows.length + 1
      );

      // Immediate solo check — if no one else is expected, try to finalize
      const finalized = await tryAutoFinalize(targetHash, createdAt);
      if (!finalized) {
        logger.info(
          { targetHash: targetHash.slice(0, 16) },
          "[AutonomousNode] Waiting for additional nodes to vote…"
        );
      }

    } catch (err: unknown) {
      logger.warn({ err, targetHash: targetHash.slice(0, 16) }, "[AutonomousNode] Cycle error.");
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startAutonomousNode(): Promise<void> {
  if (isBooted) {
    logger.warn("[AutonomousNode] Already running — ignoring duplicate start.");
    return;
  }

  try {
    await initSystemNode();
  } catch (err) {
    logger.error({ err }, "[AutonomousNode] Boot failed — worker will not start.");
    return;
  }

  setTimeout(() => {
    runCycle().catch((e) => logger.warn({ err: e }, "[AutonomousNode] First cycle error."));
  }, 5_000);

  loopHandle = setInterval(() => {
    runCycle().catch((e) => logger.warn({ err: e }, "[AutonomousNode] Loop error."));
  }, LOOP_INTERVAL_MS);

  logger.info({ intervalMs: LOOP_INTERVAL_MS }, "[AutonomousNode] Worker started.");
}

export function stopAutonomousNode(): void {
  if (loopHandle) { clearInterval(loopHandle); loopHandle = null; }
  isBooted = false;
  logger.info("[AutonomousNode] Worker stopped.");
}

export function getAutonomousNodeStatus(): {
  running: boolean;
  nodeId: string | null;
  aggressiveness: number;
} {
  return { running: isBooted, nodeId: systemNodeId, aggressiveness };
}

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

const LOOP_INTERVAL_MS      = 30_000;   // 30 s
const MAX_BATCH_PER_CYCLE   = 5;        // max hashes processed per tick
const DEFAULT_AGGRESSION    = 0.6;      // min score to vote
const MAX_AGGRESSION        = 0.85;
const MIN_AGGRESSION        = 0.50;
const VALID_THRESHOLD       = 0.7;      // score above → vote "valid"
const SYSTEM_USER_UUID      = "00000000-0000-0000-0000-000000000001"; // synthetic
const NODE_INITIAL_REP      = 1.5;
const STAKE_INITIAL         = 0.0;

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

  // Load or generate aggressiveness
  const storedAggr = await getConfig("autonomous_aggressiveness");
  aggressiveness = storedAggr ? parseFloat(storedAggr) : DEFAULT_AGGRESSION;

  // Load or generate keypair
  const storedPriv = await getConfig("system_node_private_key");
  const storedPub  = await getConfig("system_node_public_key");

  let pubHex: string;

  if (storedPriv && storedPub) {
    privateKeyDer = Buffer.from(storedPriv, "hex");
    pubHex        = storedPub;
    logger.info("[AutonomousNode] Loaded existing system keypair from DB.");
  } else {
    const kp = generateKeyPairSync("ed25519");
    // Export raw 32-byte private key (PKCS#8 stripped)
    const pkcs8 = kp.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    privateKeyDer = pkcs8;
    // Public key: strip 12-byte SPKI header → 32-byte raw Ed25519 key
    const spki = kp.publicKey.export({ type: "spki", format: "der" }) as Buffer;
    pubHex = spki.slice(12).toString("hex");

    await setConfig("system_node_private_key", pkcs8.toString("hex"));
    await setConfig("system_node_public_key", pubHex);
    logger.info("[AutonomousNode] Generated new system keypair.");
  }

  // node_id = SHA-256(pubKey hex)
  systemNodeId = createHash("sha256").update(pubHex).digest("hex");
  await setConfig("system_node_id", systemNodeId);

  // Ensure system user exists (device_id + name are NOT NULL in uni_users)
  await query(
    `INSERT INTO uni_users (id, device_id, name, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO NOTHING`,
    [SYSTEM_USER_UUID, "system-autonomous-node-v1", "uni.id System Node"]
  );

  // Ensure identity_node exists for system node
  // global_id is the UNIQUE key on identity_nodes — ON CONFLICT uses that
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM identity_nodes WHERE user_id = $1`,
    [SYSTEM_USER_UUID]
  );
  if (existing) {
    await query(
      `UPDATE identity_nodes
       SET node_id = $1, public_key = $2, node_reputation = GREATEST(node_reputation, $3),
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
  if (votes.length === 0) {
    // No signal — cautious default (will be skipped unless aggressive)
    return 0.5;
  }

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

  // Weight ratio (0→1)
  const weightRatio = totalWeight > 0 ? validWeight / totalWeight : 0.5;

  // Boost from trusted nodes
  const trustedBoost =
    trustedValid > trustedInvalid ? 0.1 * trustedValid : -0.1 * trustedInvalid;

  // Volume bonus: more votes → more confidence
  const volumeBonus = Math.min(0.1, votes.length * 0.01);

  const raw = weightRatio + trustedBoost + volumeBonus;
  return Math.max(0, Math.min(1, raw));
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
     ON CONFLICT (node_id, target_hash) DO NOTHING`,
    [systemNodeId, targetHash, decision, confidence]
  );
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

  // Mark memory as correct/incorrect
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
}

async function getPendingVerifications(): Promise<PendingVerification[]> {
  return query<PendingVerification>(
    `SELECT id, file_hash, votes_collected
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

// ─── Main evaluation loop ─────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  if (!systemNodeId || !privateKeyDer) return;

  const pending = await getPendingVerifications();
  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "[AutonomousNode] Processing pending verifications…");

  for (const target of pending) {
    const { file_hash: targetHash } = target;

    try {
      // Skip if we already decided on this
      if (await alreadyRemembered(targetHash)) {
        // Check if consensus has formed and evolve
        const report = await computeConsensus(targetHash, false, true);
        if (report.result !== "partial" && report.votes.total >= 3) {
          await evolveAfterConsensus(targetHash, report.result);
          await updateVerificationStatus(
            targetHash, "consensus_reached",
            report.result, report.confidence, report.votes.total
          );
        }
        continue;
      }

      // Get existing votes to evaluate
      const existingVoteRows = await query<ExistingVote>(
        `SELECT v.result, v.weight, COALESCE(n.node_reputation, 1.0) AS node_reputation
         FROM verification_votes v
         LEFT JOIN identity_nodes n ON n.node_id = v.node_id
         WHERE v.target_hash = $1`,
        [targetHash]
      );

      const trustScore = calculateTrustScore(existingVoteRows);
      const shouldVote = trustScore > aggressiveness || existingVoteRows.length === 0;

      if (!shouldVote) {
        await storeMemory(targetHash, "skipped", trustScore);
        logger.debug({ targetHash: targetHash.slice(0, 16), trustScore }, "[AutonomousNode] Skipped (low confidence).");
        continue;
      }

      const voteResult = trustScore > VALID_THRESHOLD ? "valid" : "invalid";
      const tsMs       = Date.now();
      const nonce      = generateNonce();
      const canonical  = buildVotePayload(systemNodeId, targetHash, voteResult, tsMs, nonce);
      const signature  = signPayload(canonical);

      try {
        await castVote({
          userId:      SYSTEM_USER_UUID,
          targetHash,
          result:      voteResult,
          signature,
          timestampMs: tsMs,
          nonce,
          ip:          "system-node",
        });

        await storeMemory(targetHash, voteResult, trustScore);
        await updateVerificationStatus(targetHash, "processing", undefined, undefined, existingVoteRows.length + 1);

        logger.info(
          { targetHash: targetHash.slice(0, 16), voteResult, trustScore: trustScore.toFixed(3), aggressiveness: aggressiveness.toFixed(3) },
          "[AutonomousNode] Voted."
        );
      } catch (voteErr: unknown) {
        const msg = voteErr instanceof Error ? voteErr.message : String(voteErr);
        if (msg.includes("Ya votaste") || msg.includes("ALREADY_VOTED") || msg.includes("unique")) {
          // Already voted via DB constraint — store in memory
          await storeMemory(targetHash, voteResult, trustScore);
        } else {
          logger.warn({ err: msg, targetHash: targetHash.slice(0, 16) }, "[AutonomousNode] Vote failed.");
        }
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

  // First cycle immediately (after a short delay to let migrations settle)
  setTimeout(() => {
    runCycle().catch((e) => logger.warn({ err: e }, "[AutonomousNode] First cycle error."));
  }, 5_000);

  // Regular loop
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

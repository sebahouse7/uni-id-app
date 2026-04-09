/**
 * Identity Node System — uni.id
 *
 * Each user with an Ed25519 signing key is a cryptographic node in the network.
 *
 * Node identity:
 *   node_id   = SHA-256(public_key_hex)  — deterministic, derived from key
 *   public_key = Ed25519 signing key registered in uni_users.signing_public_key
 *
 * Reputation model:
 *   Starts at 1.0. Range: [0.0, 10.0].
 *   Positive events increment it slowly; anomalies/invalid signatures decrement sharply.
 *   The reputation is a local signal — not a global consensus — but reflects
 *   observed behavior within the uni.id network.
 *
 * Node verification:
 *   A node is "verified" when it has a registered Ed25519 public key AND has
 *   successfully signed at least one event that was validated by the network.
 */

import { createHash } from "crypto";
import { query, queryOne } from "./db";
import { verifyEd25519, getUserPublicKey } from "./signing";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentityNode {
  id: string;
  user_id: string;
  global_id: string;
  node_id: string | null;
  public_key: string | null;
  trust_level: number;
  node_reputation: number;
  verified: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentEvent {
  id: number;
  user_id: string;
  node_id: string | null;
  event_type: string;
  event_hash: string | null;
  payload_preview: string | null;
  signature: string | null;
  signature_valid: boolean | null;
  reputation_delta: number;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Reputation deltas ────────────────────────────────────────────────────────

export const REPUTATION_DELTAS: Record<string, number> = {
  // Positive behaviours
  "event.verified":       +0.10,
  "document.signed":      +0.05,
  "login.success":        +0.01,
  "key.registered":       +0.20,
  // Negative behaviours
  "signature.invalid":    -0.50,
  "event.replay":         -0.20,
  "auth.token_invalid":   -0.10,
  "security.anomaly":     -0.30,
};

const REPUTATION_MIN = 0.0;
const REPUTATION_MAX = 10.0;

// ─── node_id derivation ───────────────────────────────────────────────────────

/** Derive the node_id from an Ed25519 public key hex (64 chars). */
export function deriveNodeId(publicKeyHex: string): string {
  return createHash("sha256").update(publicKeyHex, "utf8").digest("hex");
}

// ─── Node DB operations ───────────────────────────────────────────────────────

/**
 * Get or create an identity_node record for a user.
 * Syncs node_id from the user's signing_public_key if available.
 */
export async function getOrSyncNode(userId: string): Promise<IdentityNode | null> {
  // Fetch user's global_id + signing key
  const user = await queryOne<{
    global_id: string | null;
    signing_public_key: string | null;
  }>(
    `SELECT global_id, signing_public_key FROM uni_users WHERE id = $1`,
    [userId]
  );
  if (!user || !user.global_id) return null;

  const publicKey = user.signing_public_key;
  const nodeId = publicKey ? deriveNodeId(publicKey) : null;

  // Upsert identity_nodes (create if not exists, keep existing reputation)
  await query(
    `INSERT INTO identity_nodes (user_id, global_id, public_key, node_id, node_reputation, verified)
     VALUES ($1, $2, $3, $4, 1.0, false)
     ON CONFLICT (user_id) DO UPDATE
       SET global_id    = EXCLUDED.global_id,
           public_key   = COALESCE(EXCLUDED.public_key, identity_nodes.public_key),
           node_id      = COALESCE(EXCLUDED.node_id, identity_nodes.node_id),
           updated_at   = now()`,
    [userId, user.global_id, publicKey ?? null, nodeId ?? null]
  );

  return queryOne<IdentityNode>(
    `SELECT id, user_id, global_id, node_id, public_key, trust_level, node_reputation,
            verified, last_verified_at, created_at, updated_at
     FROM identity_nodes WHERE user_id = $1`,
    [userId]
  );
}

/** Get a node by its node_id (public lookup). */
export async function getNodeByNodeId(nodeId: string): Promise<IdentityNode | null> {
  return queryOne<IdentityNode>(
    `SELECT id, user_id, global_id, node_id, public_key, trust_level, node_reputation,
            verified, last_verified_at, created_at, updated_at
     FROM identity_nodes WHERE node_id = $1`,
    [nodeId]
  );
}

/** Get a node by user_id. */
export async function getNodeByUserId(userId: string): Promise<IdentityNode | null> {
  return queryOne<IdentityNode>(
    `SELECT id, user_id, global_id, node_id, public_key, trust_level, node_reputation,
            verified, last_verified_at, created_at, updated_at
     FROM identity_nodes WHERE user_id = $1`,
    [userId]
  );
}

/** Get a node by global_id (did:uniid:...). */
export async function getNodeByGlobalId(globalId: string): Promise<IdentityNode | null> {
  return queryOne<IdentityNode>(
    `SELECT n.id, n.user_id, n.global_id, n.node_id, n.public_key, n.trust_level,
            n.node_reputation, n.verified, n.last_verified_at, n.created_at, n.updated_at
     FROM identity_nodes n WHERE n.global_id = $1`,
    [globalId]
  );
}

// ─── Reputation ───────────────────────────────────────────────────────────────

/**
 * Adjust a node's reputation by a delta.
 * Clamps to [REPUTATION_MIN, REPUTATION_MAX].
 * Returns the new reputation value.
 */
export async function adjustReputation(
  userId: string,
  delta: number
): Promise<number> {
  const result = await queryOne<{ node_reputation: number }>(
    `UPDATE identity_nodes
     SET node_reputation = GREATEST($2, LEAST($3, node_reputation + $1)),
         updated_at = now()
     WHERE user_id = $4
     RETURNING node_reputation`,
    [delta, REPUTATION_MIN, REPUTATION_MAX, userId]
  );
  return result?.node_reputation ?? 1.0;
}

/**
 * Mark a node as verified and update last_verified_at.
 * Also increments trust_level by 1 (up to a max of 100).
 */
export async function markNodeVerified(userId: string): Promise<void> {
  await query(
    `UPDATE identity_nodes
     SET verified = true,
         last_verified_at = now(),
         trust_level = LEAST(100, trust_level + 1),
         updated_at = now()
     WHERE user_id = $1`,
    [userId]
  );
}

// ─── Agent events ─────────────────────────────────────────────────────────────

export interface LogEventParams {
  userId: string;
  nodeId?: string | null;
  eventType: string;
  /** The exact string that was (or could be) signed — used for hash + preview */
  payload?: string;
  /** Ed25519 signature over the payload (optional) */
  signature?: string | null;
  signatureValid?: boolean | null;
  reputationDelta?: number;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Persist an agent event to the `agent_events` table.
 */
export async function logAgentEvent(params: LogEventParams): Promise<AgentEvent> {
  const {
    userId, nodeId, eventType, payload, signature,
    signatureValid, reputationDelta = 0, ip, metadata,
  } = params;

  const eventHash = payload
    ? createHash("sha256").update(payload, "utf8").digest("hex")
    : null;
  const payloadPreview = payload ? payload.slice(0, 256) : null;

  const row = await queryOne<AgentEvent>(
    `INSERT INTO agent_events
       (user_id, node_id, event_type, event_hash, payload_preview, signature,
        signature_valid, reputation_delta, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, user_id, node_id, event_type, event_hash, payload_preview,
               signature, signature_valid, reputation_delta, ip_address, metadata, created_at`,
    [
      userId, nodeId ?? null, eventType, eventHash, payloadPreview,
      signature ?? null, signatureValid ?? null, reputationDelta,
      ip ?? null, metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return row!;
}

/** List recent agent events for a user. */
export async function getUserEvents(
  userId: string,
  limit = 50
): Promise<AgentEvent[]> {
  return query<AgentEvent>(
    `SELECT id, user_id, node_id, event_type, event_hash, payload_preview,
            signature, signature_valid, reputation_delta, ip_address, metadata, created_at
     FROM agent_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

/** Get event count and reputation summary for a node. */
export async function getNodeStats(userId: string): Promise<{
  totalEvents: number;
  verifiedEvents: number;
  invalidSignatures: number;
  reputationDelta7d: number;
}> {
  const stats = await queryOne<{
    total_events: string;
    verified_events: string;
    invalid_signatures: string;
    rep_delta_7d: string;
  }>(
    `SELECT
       COUNT(*) AS total_events,
       COUNT(*) FILTER (WHERE signature_valid = true) AS verified_events,
       COUNT(*) FILTER (WHERE signature_valid = false) AS invalid_signatures,
       COALESCE(SUM(reputation_delta) FILTER (WHERE created_at > now() - interval '7 days'), 0) AS rep_delta_7d
     FROM agent_events
     WHERE user_id = $1`,
    [userId]
  );

  return {
    totalEvents: parseInt(stats?.total_events ?? "0", 10),
    verifiedEvents: parseInt(stats?.verified_events ?? "0", 10),
    invalidSignatures: parseInt(stats?.invalid_signatures ?? "0", 10),
    reputationDelta7d: parseFloat(stats?.rep_delta_7d ?? "0"),
  };
}

// ─── Event verification ───────────────────────────────────────────────────────

export interface VerifyEventParams {
  /** The canonical event payload string (exactly what was signed on the device) */
  payload: string;
  /** Ed25519 signature hex (128 chars) */
  signature: string;
  /** Ed25519 public key hex (64 chars) — if provided, skips DB lookup */
  publicKey?: string;
  /** If no publicKey provided, look up by userId */
  userId?: string;
  /** Or look up by nodeId */
  nodeId?: string;
}

export interface VerifyEventResult {
  valid: boolean;
  reason: string;
  publicKeyUsed: string | null;
  publicKeyFingerprint: string | null;
  nodeId: string | null;
  node: Pick<IdentityNode, "global_id" | "node_reputation" | "trust_level" | "verified"> | null;
}

/**
 * Verify an event signature.
 * Resolves the public key from: params.publicKey > nodeId lookup > userId lookup.
 */
export async function verifyNodeEvent(
  params: VerifyEventParams
): Promise<VerifyEventResult> {
  const { payload, signature, publicKey: reqPubKey, userId, nodeId } = params;

  // 1. Resolve public key
  let resolvedPubKey: string | null = reqPubKey ?? null;
  let resolvedNode: IdentityNode | null = null;

  if (!resolvedPubKey && nodeId) {
    resolvedNode = await getNodeByNodeId(nodeId);
    resolvedPubKey = resolvedNode?.public_key ?? null;
  }

  if (!resolvedPubKey && userId) {
    resolvedPubKey = await getUserPublicKey(userId);
    if (!resolvedNode) resolvedNode = await getNodeByUserId(userId);
  }

  if (!resolvedPubKey) {
    return {
      valid: false,
      reason: "No se pudo resolver la clave pública. Proporcioná publicKey, nodeId, o userId.",
      publicKeyUsed: null,
      publicKeyFingerprint: null,
      nodeId: resolvedNode?.node_id ?? null,
      node: null,
    };
  }

  // 2. Verify Ed25519 signature
  const valid = verifyEd25519(payload, signature, resolvedPubKey);
  const fingerprint = resolvedPubKey.slice(0, 8).toUpperCase();
  const computedNodeId = deriveNodeId(resolvedPubKey);

  // 3. Fetch node info if not already resolved
  if (!resolvedNode) {
    resolvedNode = await getNodeByNodeId(computedNodeId);
  }

  return {
    valid,
    reason: valid
      ? `Firma válida — evento verificado con clave pública del nodo (${fingerprint})`
      : `Firma inválida — el payload no coincide con la clave pública del nodo (${fingerprint})`,
    publicKeyUsed: resolvedPubKey,
    publicKeyFingerprint: fingerprint,
    nodeId: computedNodeId,
    node: resolvedNode
      ? {
          global_id: resolvedNode.global_id,
          node_reputation: resolvedNode.node_reputation,
          trust_level: resolvedNode.trust_level,
          verified: resolvedNode.verified,
        }
      : null,
  };
}

// ─── Trust Graph — Endorsements ───────────────────────────────────────────────

/**
 * Canonical payload format for endorsement signatures.
 * Deterministic — includes both node IDs so the signature is specific
 * to exactly this endorsement direction. No timestamp needed because
 * UNIQUE(from_node_id, to_node_id) prevents replay.
 */
export function buildEndorsementPayload(
  fromNodeId: string,
  toNodeId: string
): string {
  return `endorse::${fromNodeId}::${toNodeId}`;
}

/** Reputation weight multiplier per endorsement. */
const ENDORSEMENT_WEIGHT = 0.05;
/** Maximum reputation a single endorser can contribute. */
const MAX_ENDORSEMENT_CONTRIBUTION = 0.5;

export interface Endorsement {
  id: string;
  from_node_id: string;
  to_node_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  signature: string;
  canonical_payload: string;
  reputation_applied: number;
  created_at: string;
  // Joined from identity_nodes
  from_global_id?: string | null;
  from_reputation?: number | null;
  from_verified?: boolean | null;
}

/**
 * Create an endorsement. Verifies the Ed25519 signature before persisting.
 * Applies a weighted reputation delta to the endorsed node.
 *
 * @returns { endorsement, reputationDelta } or throws on verification failure.
 */
export async function createEndorsement(params: {
  fromUserId: string;
  toNodeId: string;
  signature: string;
  ip?: string | null;
}): Promise<{ endorsement: Endorsement; reputationDelta: number }> {
  const { fromUserId, toNodeId, signature, ip } = params;

  // 1. Resolve the endorsing node
  const fromNode = await getOrSyncNode(fromUserId);
  if (!fromNode?.node_id || !fromNode.public_key) {
    throw new Error(
      "El nodo origen no tiene clave pública registrada. Registrá tu clave de firma primero."
    );
  }

  // 2. Prevent self-endorsement
  if (fromNode.node_id === toNodeId) {
    throw new Error("No podés respaldar tu propio nodo.");
  }

  // 3. Verify the target node exists
  const toNode = await getNodeByNodeId(toNodeId);
  if (!toNode) {
    throw new Error("El nodo destino no existe en la red uni.id.");
  }

  // 4. Verify signature over canonical payload
  const canonical = buildEndorsementPayload(fromNode.node_id, toNodeId);
  const valid = verifyEd25519(canonical, signature, fromNode.public_key);
  if (!valid) {
    throw new Error(
      "Firma inválida — el payload no coincide con la clave pública de tu nodo. " +
        `Asegurate de firmar exactamente: "${canonical}"`
    );
  }

  // 5. Compute reputation delta: weight by endorser's reputation
  const reputationDelta = Math.min(
    MAX_ENDORSEMENT_CONTRIBUTION,
    fromNode.node_reputation * ENDORSEMENT_WEIGHT
  );

  // 6. Insert (UNIQUE constraint prevents double endorsement)
  const row = await queryOne<Endorsement>(
    `INSERT INTO node_endorsements
       (from_node_id, to_node_id, from_user_id, to_user_id,
        signature, canonical_payload, reputation_applied)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, from_node_id, to_node_id, from_user_id, to_user_id,
               signature, canonical_payload, reputation_applied, created_at`,
    [
      fromNode.node_id, toNodeId,
      fromUserId, toNode.user_id,
      signature, canonical, reputationDelta,
    ]
  );

  // 7. Apply reputation delta to endorsed node
  await adjustReputation(toNode.user_id, reputationDelta);

  // 8. Update trust_level of endorsed node (+1 per endorsement, max 100)
  await query(
    `UPDATE identity_nodes
     SET trust_level = LEAST(100, trust_level + 1), updated_at = now()
     WHERE user_id = $1`,
    [toNode.user_id]
  );

  // 9. Log event for endorser
  await logAgentEvent({
    userId: fromUserId,
    nodeId: fromNode.node_id,
    eventType: "node.endorsed",
    payload: canonical,
    signature,
    signatureValid: true,
    reputationDelta: 0, // endorser gets nothing for endorsing
    ip,
    metadata: { to_node_id: toNodeId, reputation_applied: reputationDelta },
  });

  return { endorsement: row!, reputationDelta };
}

/**
 * Get all endorsements received by a node (who vouches for it).
 */
export async function getEndorsementsForNode(toNodeId: string): Promise<Endorsement[]> {
  return query<Endorsement>(
    `SELECT e.id, e.from_node_id, e.to_node_id, e.from_user_id, e.to_user_id,
            e.signature, e.canonical_payload, e.reputation_applied, e.created_at,
            n.global_id AS from_global_id,
            n.node_reputation AS from_reputation,
            n.verified AS from_verified
     FROM node_endorsements e
     LEFT JOIN identity_nodes n ON n.node_id = e.from_node_id
     WHERE e.to_node_id = $1
     ORDER BY e.created_at DESC`,
    [toNodeId]
  );
}

/**
 * Get all endorsements given by a node (who it vouches for).
 */
export async function getEndorsementsByNode(fromNodeId: string): Promise<Endorsement[]> {
  return query<Endorsement>(
    `SELECT e.id, e.from_node_id, e.to_node_id, e.from_user_id, e.to_user_id,
            e.signature, e.canonical_payload, e.reputation_applied, e.created_at,
            n.global_id AS from_global_id,
            n.node_reputation AS from_reputation,
            n.verified AS from_verified
     FROM node_endorsements e
     LEFT JOIN identity_nodes n ON n.node_id = e.to_node_id
     WHERE e.from_node_id = $1
     ORDER BY e.created_at DESC`,
    [fromNodeId]
  );
}

/**
 * Check if fromNode has already endorsed toNode.
 */
export async function hasEndorsed(
  fromNodeId: string,
  toNodeId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM node_endorsements WHERE from_node_id = $1 AND to_node_id = $2`,
    [fromNodeId, toNodeId]
  );
  return row !== null;
}

/**
 * Summarise endorsement stats for a node.
 */
export async function getEndorsementStats(toNodeId: string): Promise<{
  totalEndorsements: number;
  totalReputationFromEndorsements: number;
  verifiedEndorsers: number;
}> {
  const row = await queryOne<{
    total: string;
    total_rep: string;
    verified_count: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(e.reputation_applied), 0) AS total_rep,
       COUNT(*) FILTER (WHERE n.verified = true) AS verified_count
     FROM node_endorsements e
     LEFT JOIN identity_nodes n ON n.node_id = e.from_node_id
     WHERE e.to_node_id = $1`,
    [toNodeId]
  );

  return {
    totalEndorsements: parseInt(row?.total ?? "0", 10),
    totalReputationFromEndorsements: parseFloat(
      parseFloat(row?.total_rep ?? "0").toFixed(4)
    ),
    verifiedEndorsers: parseInt(row?.verified_count ?? "0", 10),
  };
}

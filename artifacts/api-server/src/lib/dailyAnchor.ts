/**
 * Daily Merkle Anchor — uni.id
 *
 * Each day, all document signature hashes are combined into a Merkle tree.
 * The root is stored in `daily_anchor` table.
 *
 * Purpose:
 *   - Proves integrity of the entire signature log for a given day
 *   - Any modification to any signature would change the Merkle root
 *   - Future: root can be published to a blockchain for external verification
 *
 * Algorithm:
 *   - Leaves: all document_hash values from uni_document_signatures for the UTC day
 *   - Sorted lexicographically for determinism
 *   - Binary tree: pairwise SHA-256(left || right), duplicate last leaf if odd
 *   - Root is SHA-256 of SHA-256 (two rounds for security)
 */

import { createHash } from "crypto";
import { query, queryOne } from "./db";

// ─── Merkle tree ───────────────────────────────────────────────────────────────

/**
 * Compute the Merkle root for an array of hex hash strings.
 * Returns a 64-char hex string (SHA-256).
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    // Empty day anchor — deterministic sentinel
    return createHash("sha256").update("uni.id::empty::anchor").digest("hex");
  }

  // Sort for determinism — order of insertion must not affect the root
  let layer: Buffer[] = [...leaves]
    .sort()
    .map((h) => Buffer.from(h.padEnd(64, "0").slice(0, 64), "hex"));

  while (layer.length > 1) {
    // Duplicate last leaf if odd count (standard Bitcoin-style Merkle)
    if (layer.length % 2 === 1) {
      layer.push(layer[layer.length - 1]!);
    }
    const next: Buffer[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const combined = Buffer.concat([layer[i]!, layer[i + 1]!]);
      next.push(createHash("sha256").update(combined).digest());
    }
    layer = next;
  }

  return layer[0]!.toString("hex");
}

/**
 * Generate a Merkle proof that a given leaf is included in the tree.
 * Returns the sibling path from leaf to root.
 */
export function generateMerkleProof(
  leaves: string[],
  targetHash: string
): { proof: Array<{ direction: "left" | "right"; hash: string }>; included: boolean } {
  const sorted = [...leaves].sort();
  const targetIdx = sorted.indexOf(targetHash);
  if (targetIdx === -1) return { proof: [], included: false };

  let layer: string[] = sorted;
  const proof: Array<{ direction: "left" | "right"; hash: string }> = [];
  let idx = targetIdx;

  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]!);
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const direction: "left" | "right" = idx % 2 === 0 ? "right" : "left";
    proof.push({ direction, hash: layer[pairIdx]! });

    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const combined = Buffer.concat([
        Buffer.from(layer[i]!.padEnd(64, "0").slice(0, 64), "hex"),
        Buffer.from(layer[i + 1]!.padEnd(64, "0").slice(0, 64), "hex"),
      ]);
      next.push(createHash("sha256").update(combined).digest("hex"));
    }
    idx = Math.floor(idx / 2);
    layer = next;
  }

  return { proof, included: true };
}

/**
 * Verify a Merkle proof independently.
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: Array<{ direction: "left" | "right"; hash: string }>,
  expectedRoot: string
): boolean {
  try {
    let current = Buffer.from(leafHash.padEnd(64, "0").slice(0, 64), "hex");

    for (const step of proof) {
      const sibling = Buffer.from(step.hash.padEnd(64, "0").slice(0, 64), "hex");
      const combined =
        step.direction === "right"
          ? Buffer.concat([current, sibling])
          : Buffer.concat([sibling, current]);
      current = createHash("sha256").update(combined).digest();
    }

    return current.toString("hex") === expectedRoot;
  } catch {
    return false;
  }
}

// ─── DB operations ─────────────────────────────────────────────────────────────

export interface DailyAnchor {
  date: string;
  merkle_root: string;
  signature_count: number;
  computed_at: string;
}

/**
 * Compute and store (upsert) the daily Merkle anchor for a given UTC date.
 * Safe to call multiple times — idempotent (updates the root if called again).
 *
 * @param date  UTC date to anchor. Defaults to today.
 * @returns     The computed Merkle root hex string.
 */
export async function computeAndStoreDailyAnchor(
  date: Date = new Date()
): Promise<{ merkleRoot: string; signatureCount: number; date: string }> {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  const rows = await query<{ document_hash: string }>(
    `SELECT document_hash FROM uni_document_signatures
     WHERE created_at >= $1 AND created_at <= $2`,
    [dayStart, dayEnd]
  );

  const hashes = rows.map((r) => r.document_hash);
  const merkleRoot = computeMerkleRoot(hashes);
  const signatureCount = hashes.length;

  await query(
    `INSERT INTO daily_anchor (date, merkle_root, signature_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (date) DO UPDATE
       SET merkle_root = EXCLUDED.merkle_root,
           signature_count = EXCLUDED.signature_count,
           computed_at = now()`,
    [dateStr, merkleRoot, signatureCount]
  );

  console.log(
    `[Anchor] 🔗 Daily anchor computed — date: ${dateStr}, signatures: ${signatureCount}, root: ${merkleRoot.slice(0, 16)}...`
  );

  return { merkleRoot, signatureCount, date: dateStr };
}

/**
 * Compute and store anchors for yesterday + today (called on startup).
 * Yesterday's anchor finalizes; today's anchor is provisional.
 */
export async function computeStartupAnchors(): Promise<void> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    await computeAndStoreDailyAnchor(yesterday);
    await computeAndStoreDailyAnchor(now);
  } catch (err: any) {
    console.warn("[Anchor] Startup anchor computation failed:", err?.message);
  }
}

/** Get all daily anchors, most recent first. */
export async function getDailyAnchors(limit = 30): Promise<DailyAnchor[]> {
  return query<DailyAnchor>(
    `SELECT date::text AS date, merkle_root, signature_count, computed_at
     FROM daily_anchor
     ORDER BY date DESC
     LIMIT $1`,
    [limit]
  );
}

/** Get anchor for a specific date (YYYY-MM-DD). */
export async function getAnchorForDate(
  dateStr: string
): Promise<DailyAnchor | null> {
  return queryOne<DailyAnchor>(
    `SELECT date::text AS date, merkle_root, signature_count, computed_at
     FROM daily_anchor WHERE date = $1`,
    [dateStr]
  );
}

/**
 * Verify whether a document hash is included in the Merkle tree for a given date.
 * Regenerates the Merkle tree from DB data and checks inclusion.
 */
export async function verifyHashInAnchor(
  dateStr: string,
  documentHash: string
): Promise<{
  included: boolean;
  merkleRoot: string | null;
  proof: Array<{ direction: "left" | "right"; hash: string }>;
  date: string;
  reason: string;
}> {
  const anchor = await getAnchorForDate(dateStr);
  if (!anchor) {
    return {
      included: false,
      merkleRoot: null,
      proof: [],
      date: dateStr,
      reason: `Sin anclaje Merkle para la fecha ${dateStr}`,
    };
  }

  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;
  const rows = await query<{ document_hash: string }>(
    `SELECT document_hash FROM uni_document_signatures
     WHERE created_at >= $1 AND created_at <= $2`,
    [dayStart, dayEnd]
  );

  const hashes = rows.map((r) => r.document_hash);
  const { proof, included } = generateMerkleProof(hashes, documentHash);

  return {
    included,
    merkleRoot: anchor.merkle_root,
    proof,
    date: dateStr,
    reason: included
      ? `Hash incluido en anclaje Merkle del ${dateStr} (raíz: ${anchor.merkle_root.slice(0, 16)}...)`
      : `Hash NO encontrado en anclaje del ${dateStr}`,
  };
}

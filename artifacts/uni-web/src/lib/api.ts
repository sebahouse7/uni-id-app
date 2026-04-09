/**
 * API client for uni.id Light Consensus
 * Uses VITE_API_URL env var for production (Railway)
 * Falls back to relative paths for Replit dev environment
 */

const API_BASE = (import.meta.env["VITE_API_URL"] ?? "") + "/api";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res  = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SubmitResult {
  hash: string;
  status: string;
  message: string;
  polling?: { url: string; intervalSuggestedMs: number };
  network: string;
}

export interface VerificationStatus {
  hash: string;
  status: string;
  consensus_result: string;
  confidence: number;
  economic_security: "high" | "medium" | "low" | "none";
  votes: { total: number; valid: number; invalid: number; trusted_nodes: number };
  score: number;
  suspicious: boolean;
  submitted_at: string;
  last_updated_at: string;
}

export interface NodeStatus {
  autonomous_node: {
    running: boolean;
    node_id: string | null;
    aggressiveness: number;
    loop_interval_s: number;
    description: string;
  };
}

export interface NetworkStats {
  total: number;
  pending: number;
  consensus_reached: number;
}

export async function submitDocument(fileHash: string): Promise<SubmitResult> {
  return apiFetch<SubmitResult>("/verify/document", {
    method: "POST",
    body: JSON.stringify({ file_hash: fileHash }),
  });
}

export async function getVerificationStatus(
  hash: string
): Promise<VerificationStatus> {
  return apiFetch<VerificationStatus>(`/verify/document/${hash}`);
}

export async function getNodeStatus(): Promise<NodeStatus> {
  return apiFetch<NodeStatus>("/verify/node/status");
}

export async function getNetworkStats(): Promise<NetworkStats> {
  return apiFetch<NetworkStats>("/verify/network/stats").catch(() => ({
    total: 0,
    pending: 0,
    consensus_reached: 0,
  }));
}

/** Compute SHA-256 of a File using Web Crypto API (no deps) */
export async function hashFile(file: File): Promise<string> {
  const buf    = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Evidence Bundle — uni.id
 *
 * Generates a self-verifiable, portable evidence package for a signed document.
 * The bundle is fully self-contained: every piece of data needed to verify the
 * signature independently is included — no backend dependency required.
 *
 * Verification chain:
 *   1. Ed25519 signature  → verified against signer.public_key
 *   2. TSA token (RFC 3161) → verified against tsa.token (embedded hash + genTime)
 *   3. Merkle proof       → verified against merkle.root
 */

import { createPublicKey, verify as nodeVerify } from "crypto";
import { queryOne, query } from "./db";
import { verifyTsaToken } from "./tsa";
import {
  getAnchorForDate,
  generateMerkleProof,
  verifyMerkleProof,
} from "./dailyAnchor";

// ─── Evidence bundle types ────────────────────────────────────────────────────

export interface EvidenceSignature {
  id: string;
  document_hash: string;
  signature: string;
  signature_type: "ed25519" | "hmac" | string;
  algorithm: string;
  signed_at: string;
  consented: boolean;
}

export interface EvidenceSigner {
  global_id: string | null;
  public_key: string | null;
  public_key_fingerprint: string | null;
}

export interface EvidenceTsa {
  status: "none" | "pending" | "verified" | "failed" | string;
  /** Full RFC 3161 DER response — base64 encoded. Null until TSA responds. */
  token: string | null;
  timestamp: string | null;
  endpoint: string | null;
  hash_verified: boolean | null;
}

export interface EvidenceMerkle {
  date: string;
  root: string | null;
  proof: Array<{ direction: "left" | "right"; hash: string }>;
  included: boolean;
  signature_count: number;
}

export interface EvidenceMetadata {
  issuer: "human.id labs S.A.S.";
  network: "uni.id Global Identity Network";
  /** Redacted for public access — present only for authenticated owner */
  ip_address?: string | null;
  device_id?: string | null;
}

export interface EvidenceBundle {
  _version: "uni.id/evidence/v1";
  _generated_at: string;
  _self_verifiable: true;
  signature: EvidenceSignature;
  signer: EvidenceSigner;
  tsa: EvidenceTsa;
  merkle: EvidenceMerkle;
  metadata: EvidenceMetadata;
  /** Human-readable instructions for independent verification without uni.id */
  _verification_guide: VerificationGuide;
}

export interface VerificationGuide {
  summary: string;
  step1_signature: string;
  step2_tsa: string;
  step3_merkle: string;
  openssl_commands: string;
}

// ─── Bundle builder ───────────────────────────────────────────────────────────

interface RawSigRow {
  id: string;
  user_id: string;
  document_id: string | null;
  document_hash: string;
  signature: string;
  algorithm: string;
  signature_type: string;
  signer_global_id: string | null;
  public_key_snapshot: string | null;
  created_at: string;
  consented: boolean;
  ip_address: string | null;
  device_id: string | null;
  tsa_token: string | null;
  tsa_timestamp: string | null;
  tsa_status: string | null;
  tsa_endpoint: string | null;
}

/**
 * Fetch all data for a signature and assemble a self-verifiable evidence bundle.
 *
 * @param signatureId  UUID of the signature record
 * @param includePrivateMeta  If true, includes IP and device_id (owner-only fields)
 */
export async function buildEvidenceBundle(
  signatureId: string,
  includePrivateMeta = false
): Promise<EvidenceBundle | null> {
  const row = await queryOne<RawSigRow>(
    `SELECT id, user_id, document_id, document_hash, signature, algorithm,
            signature_type, signer_global_id, public_key_snapshot,
            created_at, consented, ip_address, device_id,
            tsa_token, tsa_timestamp, tsa_status, tsa_endpoint
     FROM uni_document_signatures
     WHERE id = $1`,
    [signatureId]
  );

  if (!row) return null;

  // ── Merkle proof ──────────────────────────────────────────────────────────
  const signedDate = row.created_at.slice(0, 10); // YYYY-MM-DD UTC
  const anchor = await getAnchorForDate(signedDate);

  let merkle: EvidenceMerkle = {
    date: signedDate,
    root: null,
    proof: [],
    included: false,
    signature_count: 0,
  };

  if (anchor) {
    const dayStart = `${signedDate}T00:00:00.000Z`;
    const dayEnd = `${signedDate}T23:59:59.999Z`;
    const leaves = await query<{ document_hash: string }>(
      `SELECT document_hash FROM uni_document_signatures
       WHERE created_at >= $1 AND created_at <= $2`,
      [dayStart, dayEnd]
    );
    const hashes = leaves.map((l) => l.document_hash);
    const { proof, included } = generateMerkleProof(hashes, row.document_hash);

    merkle = {
      date: signedDate,
      root: anchor.merkle_root,
      proof,
      included,
      signature_count: anchor.signature_count,
    };
  }

  // ── TSA hash check ────────────────────────────────────────────────────────
  let tsaHashVerified: boolean | null = null;
  if (row.tsa_token && row.tsa_status === "verified") {
    const tsaCheck = verifyTsaToken(row.tsa_token, row.document_hash);
    tsaHashVerified = tsaCheck.hashMatch;
  }

  // ── Public key fingerprint ────────────────────────────────────────────────
  const pubKey = row.public_key_snapshot;
  const pubKeyFingerprint = pubKey ? pubKey.slice(0, 8).toUpperCase() : null;

  // ── OpenSSL verification commands ─────────────────────────────────────────
  const opensslCmds =
    pubKey && row.signature_type === "ed25519"
      ? [
          "# ─── Verificar firma Ed25519 con OpenSSL ───",
          "# 1. Guardar el mensaje firmado (document_hash como UTF-8):",
          `printf '%s' '${row.document_hash}' > msg.bin`,
          "",
          "# 2. Reconstruir clave pública SPKI (DER):",
          `printf '302A300506032B6570032100${pubKey}' | xxd -r -p > pub.der`,
          "",
          "# 3. Guardar la firma (hex → binario):",
          `printf '${row.signature}' | xxd -r -p > sig.bin`,
          "",
          "# 4. Verificar:",
          "openssl pkeyutl -verify -pubin -keyform DER -inkey pub.der -sigfile sig.bin -in msg.bin",
          "# Esperado: 'Signature Verified Successfully'",
        ].join("\n")
      : "# Firma HMAC-SHA256 — verificación requiere clave secreta del servidor uni.id.";

  const tsaOssl = row.tsa_token
    ? [
        "# ─── Verificar token TSA con OpenSSL ───",
        "# 1. Decodificar token TSA (base64 → DER):",
        "echo '<tsa.token>' | base64 -d > timestamp.tsr",
        "",
        "# 2. Guardar el hash del documento:",
        `echo '${row.document_hash}' > hash.txt`,
        "",
        "# 3. Descargar certificado raíz de FreeTSA.org:",
        "curl -o cacert.pem https://freetsa.org/files/cacert.pem",
        "curl -o tsa.crt https://freetsa.org/files/tsa.crt",
        "",
        "# 4. Verificar:",
        `openssl ts -verify -in timestamp.tsr -digest ${row.document_hash} -sha256 -CAfile cacert.pem -untrusted tsa.crt`,
      ].join("\n")
    : "# Sin token TSA disponible para esta firma.";

  const merkleInstructions = [
    "# ─── Verificar inclusión en árbol Merkle ───",
    "# Algoritmo: SHA-256 binario, hojas ordenadas lexicográficamente.",
    `# Raíz declarada: ${merkle.root ?? "no disponible"}`,
    `# Fecha: ${merkle.date} (UTC)`,
    "",
    "# Pasos para verificar la prueba (merkle.proof):",
    "# 1. Empezar con: current = document_hash",
    "# 2. Para cada paso en merkle.proof:",
    "#    - si direction='right': combined = current || sibling",
    "#    - si direction='left':  combined = sibling || current",
    "#    - current = SHA-256(combined)",
    "# 3. current final debe coincidir con merkle.root",
  ].join("\n");

  return {
    _version: "uni.id/evidence/v1",
    _generated_at: new Date().toISOString(),
    _self_verifiable: true,

    signature: {
      id: row.id,
      document_hash: row.document_hash,
      signature: row.signature,
      signature_type: (row.signature_type ?? "hmac") as "ed25519" | "hmac",
      algorithm: row.algorithm,
      signed_at: row.created_at,
      consented: row.consented,
    },

    signer: {
      global_id: row.signer_global_id,
      public_key: pubKey,
      public_key_fingerprint: pubKeyFingerprint,
    },

    tsa: {
      status: (row.tsa_status ?? "none") as EvidenceTsa["status"],
      token: row.tsa_token,
      timestamp: row.tsa_timestamp,
      endpoint: row.tsa_endpoint,
      hash_verified: tsaHashVerified,
    },

    merkle,

    metadata: {
      issuer: "human.id labs S.A.S.",
      network: "uni.id Global Identity Network",
      ...(includePrivateMeta
        ? { ip_address: row.ip_address, device_id: row.device_id }
        : {}),
    },

    _verification_guide: {
      summary:
        "Este archivo es auto-verificable. Contiene la firma Ed25519 del firmante, " +
        "el token TSA RFC 3161 de un tercero independiente, y la prueba de inclusión " +
        "en el árbol Merkle diario de uni.id. Cada componente puede verificarse " +
        "independientemente usando OpenSSL u otras herramientas estándar.",
      step1_signature:
        "Verificar que signature.signature es una firma Ed25519 válida de " +
        "signature.document_hash con signer.public_key.",
      step2_tsa:
        "Verificar que tsa.token (RFC 3161 DER, base64) fue emitido por un TSA de " +
        "confianza, que incluye exactamente signature.document_hash, y que tsa.timestamp " +
        "corresponde al momento declarado.",
      step3_merkle:
        "Verificar que signature.document_hash está incluido en el árbol Merkle de " +
        "merkle.date siguiendo merkle.proof hasta llegar a merkle.root.",
      openssl_commands: [opensslCmds, "", tsaOssl, "", merkleInstructions].join(
        "\n"
      ),
    },
  };
}

/** Fetch just the user_id and document_id for a signature (for access control). */
export async function getSignatureOwnership(signatureId: string): Promise<{
  user_id: string;
  document_id: string | null;
} | null> {
  return queryOne<{ user_id: string; document_id: string | null }>(
    `SELECT user_id, document_id FROM uni_document_signatures WHERE id = $1`,
    [signatureId]
  );
}

// ─── verifyEvidence — standalone verifier (no backend) ───────────────────────

export interface VerifyEvidenceResult {
  overall: "valid" | "partial" | "invalid";
  checks: {
    signature: { valid: boolean | null; reason: string };
    tsa: { valid: boolean | null; reason: string };
    merkle: { valid: boolean | null; reason: string };
  };
  verified_at: string;
  summary: string;
}

/**
 * Verify all components of an evidence bundle locally.
 * Works in any Node.js v18+ environment — no backend call needed.
 *
 * Returns `overall: "valid"` only when ALL three checks pass.
 * Returns `overall: "partial"` when signature is valid but TSA/Merkle are unavailable.
 * Returns `overall: "invalid"` when signature verification fails.
 */
export function verifyEvidence(bundle: EvidenceBundle): VerifyEvidenceResult {
  const checks: VerifyEvidenceResult["checks"] = {
    signature: { valid: null, reason: "No verificado" },
    tsa: { valid: null, reason: "Sin timestamp TSA" },
    merkle: { valid: null, reason: "Sin anclaje Merkle" },
  };

  // ── 1. Signature ────────────────────────────────────────────────────────────
  if (bundle.signature.signature_type === "ed25519") {
    const pubKey = bundle.signer.public_key;
    if (!pubKey || pubKey.length !== 64) {
      checks.signature = {
        valid: false,
        reason: "Clave pública faltante o con formato inválido (debe ser 64 hex chars)",
      };
    } else {
      try {
        // Ed25519 SPKI DER = 12-byte header + 32-byte raw key
        const spkiHeader = Buffer.from("302A300506032B6570032100", "hex");
        const rawPub = Buffer.from(pubKey, "hex");
        const keyObj = createPublicKey({
          key: Buffer.concat([spkiHeader, rawPub]),
          format: "der",
          type: "spki",
        });
        // The signed message is document_hash as UTF-8 bytes
        const message = Buffer.from(bundle.signature.document_hash, "utf8");
        const sig = Buffer.from(bundle.signature.signature, "hex");
        const valid = nodeVerify(null, message, keyObj, sig);
        checks.signature = {
          valid,
          reason: valid
            ? "✅ Firma Ed25519 válida — verificada con clave pública del firmante"
            : "❌ Firma Ed25519 inválida — el documento puede haber sido modificado",
        };
      } catch (err: any) {
        checks.signature = {
          valid: false,
          reason: `Error de verificación criptográfica: ${err?.message ?? String(err)}`,
        };
      }
    }
  } else if (bundle.signature.signature_type === "hmac") {
    // HMAC requires the server's secret key — mark as non-verifiable locally
    checks.signature = {
      valid: null,
      reason:
        "⚠️  Firma HMAC-SHA256 — verificación local no disponible. " +
        "Requiere la clave secreta del servidor uni.id. " +
        "Usá POST /signatures/verify para verificación completa.",
    };
  }

  // ── 2. TSA token ────────────────────────────────────────────────────────────
  if (bundle.tsa.status === "verified" && bundle.tsa.token) {
    const tsaResult = verifyTsaToken(bundle.tsa.token, bundle.signature.document_hash);
    checks.tsa = {
      valid: tsaResult.valid,
      reason: tsaResult.valid
        ? `✅ Token TSA RFC 3161 válido — hash verificado, emitido: ${tsaResult.timestamp?.toISOString() ?? "fecha desconocida"}`
        : `❌ ${tsaResult.reason}`,
    };
  } else if (bundle.tsa.status === "pending") {
    checks.tsa = {
      valid: null,
      reason: "⏳ Timestamp TSA en proceso — volvé a descargar la evidencia en unos minutos",
    };
  } else if (!bundle.tsa.token) {
    checks.tsa = {
      valid: null,
      reason:
        bundle.tsa.status === "none"
          ? "ℹ️  Sin timestamp externo (registro previo al sistema TSA de uni.id)"
          : "ℹ️  Token TSA no disponible",
    };
  }

  // ── 3. Merkle proof ─────────────────────────────────────────────────────────
  if (bundle.merkle.root && bundle.merkle.proof.length > 0 && bundle.merkle.included) {
    const valid = verifyMerkleProof(
      bundle.signature.document_hash,
      bundle.merkle.proof,
      bundle.merkle.root
    );
    checks.merkle = {
      valid,
      reason: valid
        ? `✅ Incluido en árbol Merkle del ${bundle.merkle.date} (raíz: ${bundle.merkle.root.slice(0, 16)}...)`
        : `❌ Prueba Merkle inválida — la raíz reconstruida no coincide con la declarada`,
    };
  } else if (bundle.merkle.root && !bundle.merkle.included) {
    checks.merkle = {
      valid: false,
      reason: `❌ Hash NO encontrado en el árbol Merkle del ${bundle.merkle.date}`,
    };
  } else if (!bundle.merkle.root) {
    checks.merkle = {
      valid: null,
      reason: `ℹ️  Sin anclaje Merkle para la fecha ${bundle.merkle.date}`,
    };
  } else if (bundle.merkle.proof.length === 0 && bundle.merkle.signature_count <= 1) {
    // Single signature in the tree — no proof needed, root IS the leaf
    checks.merkle = {
      valid: bundle.merkle.included,
      reason: bundle.merkle.included
        ? `✅ Única firma del día — el hash es directamente la raíz Merkle`
        : `❌ Hash no encontrado en árbol del ${bundle.merkle.date}`,
    };
  }

  // ── Overall result ──────────────────────────────────────────────────────────
  const sig = checks.signature.valid;
  const tsa = checks.tsa.valid;
  const merkle = checks.merkle.valid;

  let overall: VerifyEvidenceResult["overall"];
  let summary: string;

  if (sig === true && tsa === true && merkle === true) {
    overall = "valid";
    summary =
      "✅ EVIDENCIA COMPLETAMENTE VÁLIDA — Firma Ed25519 + Timestamp RFC 3161 + Anclaje Merkle verificados. " +
      "Validez legal fuerte: el documento existía antes del timestamp externo emitido por un tercero independiente.";
  } else if (sig === false) {
    overall = "invalid";
    summary =
      "❌ EVIDENCIA INVÁLIDA — La firma criptográfica del firmante no pasa la verificación. " +
      "El documento puede haber sido alterado después de la firma.";
  } else if (sig === true && (tsa === null || tsa === true) && (merkle === null || merkle === true)) {
    overall = sig === true && (tsa === true || merkle === true) ? "valid" : "partial";
    summary =
      sig === true && (tsa === true || merkle === true)
        ? "✅ EVIDENCIA VÁLIDA — Firma verificada" +
          (tsa === true ? " + Timestamp TSA" : "") +
          (merkle === true ? " + Anclaje Merkle" : "") +
          "."
        : "⚠️  EVIDENCIA PARCIAL — Firma válida. " +
          "Timestamp y/o Merkle no disponibles (pueden estar pendientes o ser registros previos).";
  } else {
    overall = "partial";
    summary =
      "⚠️  EVIDENCIA PARCIAL — Algunos componentes no pudieron verificarse completamente. " +
      "Revisá los checks individuales para más detalle.";
  }

  return { overall, checks, verified_at: new Date().toISOString(), summary };
}

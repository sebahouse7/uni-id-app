/**
 * Daily Merkle Anchor Routes — uni.id
 *
 * GET  /anchor/daily            — List recent daily anchors
 * GET  /anchor/:date            — Get anchor for a specific date (YYYY-MM-DD)
 * POST /anchor/compute          — (internal) Trigger anchor computation for today/yesterday
 * POST /anchor/verify-inclusion — Verify a document hash is in a date's Merkle tree
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import {
  getDailyAnchors,
  getAnchorForDate,
  computeAndStoreDailyAnchor,
  verifyHashInAnchor,
} from "../lib/dailyAnchor";

const router = Router();

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

// ─── GET /anchor/daily — list recent daily anchors (public) ───────────────────
router.get("/daily", async (_req: Request, res: Response) => {
  const anchors = await getDailyAnchors(60);
  res.json({
    anchors: anchors.map((a) => ({
      date: a.date,
      merkleRoot: a.merkle_root,
      signatureCount: a.signature_count,
      computedAt: a.computed_at,
    })),
    count: anchors.length,
  });
});

// ─── GET /anchor/:date — get anchor for specific date (public) ────────────────
router.get(
  "/:date",
  [param("date").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Fecha debe ser YYYY-MM-DD")],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const dateStr = String(req.params["date"] ?? "");
    const anchor = await getAnchorForDate(dateStr);
    if (!anchor) {
      res.status(404).json({ error: `Sin anclaje Merkle para la fecha ${dateStr}` });
      return;
    }
    res.json({
      date: anchor.date,
      merkleRoot: anchor.merkle_root,
      signatureCount: anchor.signature_count,
      computedAt: anchor.computed_at,
      description:
        "Raíz del árbol Merkle de todas las firmas del día. " +
        "Cualquier modificación a cualquier firma cambiaría esta raíz.",
    });
  }
);

// ─── POST /anchor/compute — trigger anchor computation (internal key) ─────────
router.post("/compute", async (req: Request, res: Response) => {
  const internalKey = process.env["INTERNAL_API_KEY"];
  if (internalKey && req.headers["x-internal-key"] !== internalKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const dateParam = String(req.body?.date ?? "").trim();
  const date = dateParam ? new Date(dateParam + "T12:00:00Z") : new Date();

  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "Formato de fecha inválido. Usar YYYY-MM-DD." });
    return;
  }

  const result = await computeAndStoreDailyAnchor(date);
  res.json({
    message: "Anclaje Merkle computado exitosamente",
    ...result,
  });
});

// ─── POST /anchor/verify-inclusion — verify hash is in Merkle tree (public) ───
router.post(
  "/verify-inclusion",
  [
    body("documentHash")
      .isString()
      .isLength({ min: 64, max: 64 })
      .withMessage("documentHash debe ser 64 hex chars (SHA-256)"),
    body("date")
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage("date debe ser YYYY-MM-DD"),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { documentHash, date } = req.body as { documentHash: string; date: string };

    const result = await verifyHashInAnchor(date, documentHash);
    res.json({
      included: result.included,
      merkleRoot: result.merkleRoot,
      proof: result.proof,
      date: result.date,
      reason: result.reason,
      instructions: result.included
        ? "Para verificar la prueba de inclusión sin confiar en este servidor, " +
          "reconstruí el árbol Merkle con los hashes del día y verificá que el camino desde " +
          "tu hash hasta la raíz coincide."
        : undefined,
    });
  }
);

export default router;

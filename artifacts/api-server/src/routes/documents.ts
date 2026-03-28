import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
import { encryptField, decryptField } from "../lib/crypto";
import { log } from "../lib/audit";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

const ALLOWED_CATEGORIES = ["identity","education","health","driving","property","pets","other"];

function encryptDoc(doc: any, userId: string) {
  return {
    description_enc: doc.description ? encryptField(doc.description, userId) : null,
    file_uri_enc: doc.fileUri ? encryptField(doc.fileUri, userId) : null,
    file_name_enc: doc.fileName ? encryptField(doc.fileName, userId) : null,
  };
}

function decryptDoc(row: any, userId: string) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description_enc ? decryptField(row.description_enc, userId) : null,
    fileUri: row.file_uri_enc ? decryptField(row.file_uri_enc, userId) : null,
    fileName: row.file_name_enc ? decryptField(row.file_name_enc, userId) : null,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET all documents
router.get("/", async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT * FROM uni_documents WHERE user_id = $1 ORDER BY updated_at DESC`,
    [req.user!.sub]
  );
  const docs = rows.map((r) => decryptDoc(r, req.user!.sub));
  res.json(docs);
});

// GET one document
router.get(
  "/:id",
  [param("id").isUUID()],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const row = await queryOne(
      `SELECT * FROM uni_documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.sub]
    );
    if (!row) { res.status(404).json({ error: "Documento no encontrado" }); return; }
    res.json(decryptDoc(row, req.user!.sub));
  }
);

// POST create document
router.post(
  "/",
  [
    body("title").isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("category").isIn(ALLOWED_CATEGORIES),
    body("description").optional().isString().isLength({ max: 2000 }),
    body("fileUri").optional().isString().isLength({ max: 2000 }),
    body("fileName").optional().isString().isLength({ max: 500 }),
    body("tags").optional().isArray({ max: 10 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { title, category, description, fileUri, fileName, tags } = req.body;
    const userId = req.user!.sub;
    const enc = encryptDoc({ description, fileUri, fileName }, userId);

    const [row] = await query(
      `INSERT INTO uni_documents (user_id, title, category, description_enc, file_uri_enc, file_name_enc, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, title, category, enc.description_enc, enc.file_uri_enc, enc.file_name_enc, tags ?? []]
    );
    await log({ userId, event: "document.created", ip: req.ip, metadata: { category } });
    res.status(201).json(decryptDoc(row, userId));
  }
);

// PATCH update document
router.patch(
  "/:id",
  requireAuth,
  [
    param("id").isUUID(),
    body("title").optional().isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("category").optional().isIn(ALLOWED_CATEGORIES),
    body("description").optional().isString().isLength({ max: 2000 }),
    body("fileUri").optional().isString().isLength({ max: 2000 }),
    body("fileName").optional().isString().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const existing = await queryOne(
      `SELECT * FROM uni_documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!existing) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    const { title, category, description, fileUri, fileName, tags } = req.body;
    const enc = encryptDoc(
      {
        description: description !== undefined ? description : (existing.description_enc ? decryptField(existing.description_enc, userId) : null),
        fileUri: fileUri !== undefined ? fileUri : (existing.file_uri_enc ? decryptField(existing.file_uri_enc, userId) : null),
        fileName: fileName !== undefined ? fileName : (existing.file_name_enc ? decryptField(existing.file_name_enc, userId) : null),
      },
      userId
    );

    const [row] = await query(
      `UPDATE uni_documents SET
         title = COALESCE($1, title),
         category = COALESCE($2, category),
         description_enc = $3,
         file_uri_enc = $4,
         file_name_enc = $5,
         tags = COALESCE($6, tags),
         updated_at = NOW()
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [title ?? null, category ?? null, enc.description_enc, enc.file_uri_enc, enc.file_name_enc, tags ?? null, req.params.id, userId]
    );
    await log({ userId, event: "document.updated", ip: req.ip });
    res.json(decryptDoc(row, userId));
  }
);

// DELETE document
router.delete(
  "/:id",
  [param("id").isUUID()],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const result = await query(
      `DELETE FROM uni_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, userId]
    );
    if (!result.length) { res.status(404).json({ error: "Documento no encontrado" }); return; }
    await log({ userId, event: "document.deleted", ip: req.ip });
    res.json({ ok: true });
  }
);

export default router;

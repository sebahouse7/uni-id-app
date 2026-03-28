import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
import { encryptFieldAsync, decryptFieldAsync } from "../lib/keyManager";
import { log } from "../lib/audit";
import { raiseSecurityEvent } from "../lib/monitor";
import { requireAuth } from "../middlewares/auth";
import { verifyOwnership } from "../middlewares/ownershipCheck";

const router = Router();
router.use(requireAuth);

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

const ALLOWED_CATEGORIES = ["identity","education","health","driving","property","pets","other"];

async function encryptDoc(doc: { description?: string; fileUri?: string; fileName?: string }, userId: string) {
  const [description_enc, file_uri_enc, file_name_enc] = await Promise.all([
    doc.description ? encryptFieldAsync(doc.description, userId) : Promise.resolve(null),
    doc.fileUri ? encryptFieldAsync(doc.fileUri, userId) : Promise.resolve(null),
    doc.fileName ? encryptFieldAsync(doc.fileName, userId) : Promise.resolve(null),
  ]);
  return { description_enc, file_uri_enc, file_name_enc };
}

async function decryptDoc(row: any, userId: string) {
  const [description, fileUri, fileName] = await Promise.all([
    row.description_enc ? decryptFieldAsync(row.description_enc, userId).catch(() => null) : Promise.resolve(null),
    row.file_uri_enc ? decryptFieldAsync(row.file_uri_enc, userId).catch(() => null) : Promise.resolve(null),
    row.file_name_enc ? decryptFieldAsync(row.file_name_enc, userId).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description,
    fileUri,
    fileName,
    tags: row.tags ?? [],
    keyVersion: row.key_version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET all documents — user_id filter is ALWAYS enforced in SQL
router.get("/", async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const rows = await query(
    `SELECT * FROM uni_documents WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  const docs = await Promise.all(rows.map((r) => decryptDoc(r, userId)));
  res.json(docs);
});

// GET one document — ownership verified by middleware before handler runs
router.get(
  "/:id",
  [param("id").isUUID()],
  verifyOwnership("uni_documents"),
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const row = await queryOne(
      `SELECT * FROM uni_documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.sub]
    );
    if (!row) { res.status(404).json({ error: "Documento no encontrado" }); return; }
    res.json(await decryptDoc(row, req.user!.sub));
  }
);

// POST create document
router.post(
  "/",
  [
    body("title").isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("category").isIn(ALLOWED_CATEGORIES),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("fileUri").optional().isString().isLength({ max: 2000 }),
    body("fileName").optional().isString().isLength({ max: 500 }),
    body("tags").optional().isArray({ max: 10 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { title, category, description, fileUri, fileName, tags } = req.body;
    const userId = req.user!.sub;
    const enc = await encryptDoc({ description, fileUri, fileName }, userId);

    const [row] = await query(
      `INSERT INTO uni_documents (user_id, title, category, description_enc, file_uri_enc, file_name_enc, tags, key_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1) RETURNING *`,
      [userId, title, category, enc.description_enc, enc.file_uri_enc, enc.file_name_enc, tags ?? []]
    );
    await log({ userId, event: "document.created", ip: req.ip, metadata: { category } });
    res.status(201).json(await decryptDoc(row, userId));
  }
);

// PATCH update document — ownership verified by middleware
router.patch(
  "/:id",
  [
    param("id").isUUID(),
    body("title").optional().isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("category").optional().isIn(ALLOWED_CATEGORIES),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("fileUri").optional().isString().isLength({ max: 2000 }),
    body("fileName").optional().isString().isLength({ max: 500 }),
    body("tags").optional().isArray({ max: 10 }),
  ],
  verifyOwnership("uni_documents"),
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const existing = await queryOne(
      `SELECT * FROM uni_documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!existing) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    const { title, category, description, fileUri, fileName, tags } = req.body;

    // Decrypt existing values if not being updated
    const getField = async (newVal: string | undefined, encField: string | null) => {
      if (newVal !== undefined) return newVal;
      if (encField) return decryptFieldAsync(encField, userId).catch(() => null);
      return null;
    };

    const [descVal, uriVal, nameVal] = await Promise.all([
      getField(description, existing.description_enc),
      getField(fileUri, existing.file_uri_enc),
      getField(fileName, existing.file_name_enc),
    ]);

    const enc = await encryptDoc(
      { description: descVal ?? undefined, fileUri: uriVal ?? undefined, fileName: nameVal ?? undefined },
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
    res.json(await decryptDoc(row, userId));
  }
);

// DELETE document — ownership verified by middleware
router.delete(
  "/:id",
  [param("id").isUUID()],
  verifyOwnership("uni_documents"),
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

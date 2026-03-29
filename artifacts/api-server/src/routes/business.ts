import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── GET /businesses — lista empresas del usuario ─────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT * FROM uni_businesses WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.sub]
  );
  res.json(rows);
});

// ─── POST /businesses — crear empresa ─────────────────────────────────────────
router.post(
  "/",
  [
    body("name").isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("legalName").optional().isString().isLength({ max: 300 }).trim().escape(),
    body("taxId").optional().isString().isLength({ max: 50 }).trim(),
    body("businessType").optional().isString().isLength({ max: 50 }).trim(),
    body("industry").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("foundedDate").optional().isString().isLength({ max: 20 }).trim(),
    body("address").optional().isString().isLength({ max: 300 }).trim().escape(),
    body("city").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("country").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("website").optional().isURL().isLength({ max: 300 }),
    body("email").optional().isEmail().normalizeEmail(),
    body("phone").optional().isString().isLength({ max: 50 }).trim(),
    body("description").optional().isString().isLength({ max: 1000 }).trim().escape(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { name, legalName, taxId, businessType, industry, foundedDate,
            address, city, country, website, email, phone, description } = req.body;
    const userId = req.user!.sub;
    const id = genId();
    const row = await queryOne(
      `INSERT INTO uni_businesses
         (id, user_id, name, legal_name, tax_id, business_type, industry,
          founded_date, address, city, country, website, email, phone, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [id, userId, name, legalName ?? null, taxId ?? null, businessType ?? "SAS",
       industry ?? null, foundedDate ?? null, address ?? null, city ?? null,
       country ?? "Argentina", website ?? null, email ?? null, phone ?? null,
       description ?? null]
    );
    await log({ userId, event: "business.created", ip: req.ip, metadata: { businessId: id, name } });
    res.status(201).json(row);
  }
);

// ─── PATCH /businesses/:id — actualizar empresa ───────────────────────────────
router.patch(
  "/:id",
  [
    body("name").optional().isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("legalName").optional().isString().isLength({ max: 300 }).trim().escape(),
    body("taxId").optional().isString().isLength({ max: 50 }).trim(),
    body("businessType").optional().isString().isLength({ max: 50 }).trim(),
    body("industry").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("foundedDate").optional().isString().isLength({ max: 20 }).trim(),
    body("address").optional().isString().isLength({ max: 300 }).trim().escape(),
    body("city").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("country").optional().isString().isLength({ max: 100 }).trim().escape(),
    body("website").optional().isURL().isLength({ max: 300 }),
    body("email").optional().isEmail().normalizeEmail(),
    body("phone").optional().isString().isLength({ max: 50 }).trim(),
    body("description").optional().isString().isLength({ max: 1000 }).trim().escape(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { id } = req.params;
    const userId = req.user!.sub;
    const { name, legalName, taxId, businessType, industry, foundedDate,
            address, city, country, website, email, phone, description } = req.body;
    const row = await queryOne(
      `UPDATE uni_businesses SET
         name = COALESCE($1, name),
         legal_name = COALESCE($2, legal_name),
         tax_id = COALESCE($3, tax_id),
         business_type = COALESCE($4, business_type),
         industry = COALESCE($5, industry),
         founded_date = COALESCE($6, founded_date),
         address = COALESCE($7, address),
         city = COALESCE($8, city),
         country = COALESCE($9, country),
         website = COALESCE($10, website),
         email = COALESCE($11, email),
         phone = COALESCE($12, phone),
         description = COALESCE($13, description),
         updated_at = NOW()
       WHERE id = $14 AND user_id = $15
       RETURNING *`,
      [name ?? null, legalName ?? null, taxId ?? null, businessType ?? null,
       industry ?? null, foundedDate ?? null, address ?? null, city ?? null,
       country ?? null, website ?? null, email ?? null, phone ?? null,
       description ?? null, id, userId]
    );
    if (!row) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
    await log({ userId, event: "business.updated", ip: req.ip, metadata: { businessId: id } });
    res.json(row);
  }
);

// ─── DELETE /businesses/:id ───────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.sub;
  const row = await queryOne(
    `DELETE FROM uni_businesses WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  if (!row) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
  await log({ userId, event: "business.deleted", ip: req.ip, metadata: { businessId: id } });
  res.json({ ok: true });
});

// ─── GET /businesses/:id/documents ────────────────────────────────────────────
router.get("/:id/documents", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.sub;
  const biz = await queryOne(`SELECT id FROM uni_businesses WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!biz) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
  const docs = await query(
    `SELECT * FROM uni_business_documents WHERE business_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  res.json(docs);
});

// ─── POST /businesses/:id/documents ───────────────────────────────────────────
router.post(
  "/:id/documents",
  [
    body("title").isString().isLength({ min: 1, max: 200 }).trim().escape(),
    body("description").optional().isString().isLength({ max: 500 }).trim().escape(),
    body("docType").optional().isString().isLength({ max: 50 }).trim(),
    body("fileUri").optional().isString().isLength({ max: 2000 }).trim(),
    body("fileName").optional().isString().isLength({ max: 300 }).trim(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { id } = req.params;
    const userId = req.user!.sub;
    const biz = await queryOne(`SELECT id FROM uni_businesses WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!biz) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
    const { title, description, docType, fileUri, fileName } = req.body;
    const docId = genId();
    const doc = await queryOne(
      `INSERT INTO uni_business_documents (id, business_id, user_id, title, description, doc_type, file_uri, file_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [docId, id, userId, title, description ?? null, docType ?? "other", fileUri ?? null, fileName ?? null]
    );
    await log({ userId, event: "business.document.added", ip: req.ip, metadata: { businessId: id, docId } });
    res.status(201).json(doc);
  }
);

// ─── DELETE /businesses/:id/documents/:docId ──────────────────────────────────
router.delete("/:id/documents/:docId", async (req: Request, res: Response) => {
  const { id, docId } = req.params;
  const userId = req.user!.sub;
  const row = await queryOne(
    `DELETE FROM uni_business_documents WHERE id = $1 AND business_id = $2 AND user_id = $3 RETURNING id`,
    [docId, id, userId]
  );
  if (!row) { res.status(404).json({ error: "Documento no encontrado" }); return; }
  res.json({ ok: true });
});

export default router;

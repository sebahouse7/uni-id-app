import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth } from "../middlewares/auth";
import { generateEncryptedBackup, decryptBackup } from "../lib/backup";
import { log } from "../lib/audit";
import { raiseSecurityEvent } from "../lib/monitor";
import { query } from "../lib/db";

const router = Router();
router.use(requireAuth);

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

// Export encrypted backup (user provides a PIN to encrypt the backup)
router.post(
  "/export",
  [body("backupPin").isString().isLength({ min: 6, max: 128 })],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    try {
      const encrypted = await generateEncryptedBackup(userId, req.body.backupPin);
      await log({ userId, event: "backup.exported", ip: req.ip, severity: "warn" });
      res.json({
        backup: encrypted,
        format: "aes-256-gcm-scrypt",
        exportedAt: new Date().toISOString(),
        hint: "Guardá este valor en un lugar seguro. Se necesita la PIN para restaurar.",
      });
    } catch (err: any) {
      await raiseSecurityEvent({ eventType: "backup_export_error", severity: "warn", userId, ip: req.ip });
      res.status(500).json({ error: "Error al generar backup" });
    }
  }
);

// Verify backup (decrypt and validate integrity without restoring)
router.post(
  "/verify",
  [
    body("backup").isString().isLength({ min: 10 }),
    body("backupPin").isString().isLength({ min: 6, max: 128 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    try {
      const data = await decryptBackup(req.body.backup, req.body.backupPin);
      res.json({
        valid: true,
        userId: data.userId,
        documents: data.documents?.length ?? 0,
        exportedAt: data.exportedAt,
      });
    } catch {
      res.status(400).json({ valid: false, error: "PIN incorrecto o backup corrupto" });
    }
  }
);

// Restore backup (re-import documents from backup)
router.post(
  "/restore",
  [
    body("backup").isString().isLength({ min: 10 }),
    body("backupPin").isString().isLength({ min: 6, max: 128 }),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    let data: any;
    try {
      data = await decryptBackup(req.body.backup, req.body.backupPin);
    } catch {
      res.status(400).json({ error: "PIN incorrecto o backup corrupto" });
      return;
    }

    if (data.userId !== userId) {
      await raiseSecurityEvent({
        eventType: "backup_restore_wrong_user",
        severity: "critical",
        userId,
        ip: req.ip,
        metadata: { backup_owner: data.userId },
      });
      res.status(403).json({ error: "Este backup no pertenece a tu cuenta" });
      return;
    }

    let restored = 0;
    for (const doc of data.documents ?? []) {
      try {
        await query(
          `INSERT INTO uni_documents (id, user_id, title, category, description_enc, file_uri_enc, file_name_enc, tags, created_at, updated_at)
           VALUES ($1,$2,$3,$4,NULL,NULL,NULL,$5,$6,$7)
           ON CONFLICT (id) DO NOTHING`,
          [doc.id, userId, doc.title, doc.category, doc.tags ?? [], doc.createdAt, doc.updatedAt]
        );
        restored++;
      } catch { /* skip duplicates */ }
    }

    await log({ userId, event: "backup.restored", ip: req.ip, severity: "warn", metadata: { restored } });
    res.json({ ok: true, restored });
  }
);

export default router;

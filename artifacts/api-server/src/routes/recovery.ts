import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { query, queryOne } from "../lib/db";
import { hashEmail, encryptFieldAsync, decryptFieldAsync } from "../lib/keyManager";
import { signAccessToken, signRefreshToken } from "../lib/jwt";
import { sendEmail, buildRecoveryEmail } from "../lib/email";
import { log } from "../lib/audit";
import { recordFailedAttempt, raiseSecurityEvent } from "../lib/monitor";
import { generateSecureToken } from "../lib/crypto";
import { requireAuth } from "../middlewares/auth";
import rateLimit from "express-rate-limit";

const router = Router();

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Demasiados intentos de recuperación. Intentá en 1 hora." },
});

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return false; }
  return true;
};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Set recovery email (authenticated) ──────────────────────────────────────
router.post(
  "/set-email",
  requireAuth,
  [body("email").isEmail().normalizeEmail()],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const userId = req.user!.sub;
    const { email } = req.body;

    const emailHash = hashEmail(email);
    const emailEnc = await encryptFieldAsync(email, userId);

    // Check if another user already has this email
    const existing = await queryOne(
      `SELECT id FROM uni_users WHERE recovery_email_hash = $1 AND id != $2`,
      [emailHash, userId]
    );
    if (existing) {
      res.status(409).json({ error: "Este email ya está en uso por otra cuenta" });
      return;
    }

    await query(
      `UPDATE uni_users SET recovery_email_enc = $1, recovery_email_hash = $2, updated_at = NOW()
       WHERE id = $3`,
      [emailEnc, emailHash, userId]
    );

    await log({ userId, event: "recovery_email.set", ip: req.ip, severity: "warn" });
    res.json({ ok: true, message: "Email de recuperación guardado de forma segura" });
  }
);

// ─── Request recovery OTP (unauthenticated — user lost device) ────────────────
router.post(
  "/request",
  recoveryLimiter,
  [body("email").isEmail().normalizeEmail()],
  async (req: Request, res: Response) => {
    const { email, lang } = req.body;
    const ip = req.ip ?? "unknown";

    const emailHash = hashEmail(email);
    const user = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM uni_users WHERE recovery_email_hash = $1`,
      [emailHash]
    );

    // Always respond the same to prevent email enumeration
    const genericResponse = { ok: true, message: "Si ese email existe, recibirás un código en los próximos minutos." };

    if (!user) {
      await log({ event: "recovery.email_not_found", severity: "warn", ip, metadata: { emailHash } });
      res.json(genericResponse);
      return;
    }

    // Invalidate previous unused codes for this user
    await query(
      `UPDATE uni_recovery_codes SET used = TRUE
       WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()`,
      [user.id]
    );

    const code = generateOTP();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await query(
      `INSERT INTO uni_recovery_codes (user_id, code_hash, expires_at, purpose)
       VALUES ($1, $2, $3, 'account_recovery')`,
      [user.id, codeHash, expiresAt]
    );

    const emailContent = buildRecoveryEmail(code, lang ?? "es");
    const result = await sendEmail({ to: email, ...emailContent });

    await log({
      userId: user.id,
      event: "recovery.code_sent",
      ip,
      severity: "warn",
      metadata: { emailSent: result.sent },
    });

    // Dev mode only: return the code if SMTP is not configured
    const devMode = !result.sent && process.env["NODE_ENV"] !== "production";
    res.json({
      ...genericResponse,
      ...(devMode ? { _dev_code: code, _dev_warning: "SMTP not configured — code shown only in dev mode" } : {}),
    });
  }
);

// ─── Verify OTP and recover account ──────────────────────────────────────────
router.post(
  "/verify",
  recoveryLimiter,
  [
    body("email").isEmail().normalizeEmail(),
    body("code").isString().isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { email, code } = req.body;
    const ip = req.ip ?? "unknown";

    const emailHash = hashEmail(email);
    const user = await queryOne<{ id: string; device_id: string; name: string; network_plan: string }>(
      `SELECT id, device_id, name, network_plan FROM uni_users WHERE recovery_email_hash = $1`,
      [emailHash]
    );

    if (!user) {
      await recordFailedAttempt(ip, "/recovery/verify");
      res.status(401).json({ error: "Código inválido o expirado" });
      return;
    }

    // Get the latest valid code
    const codeRecord = await queryOne<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM uni_recovery_codes
       WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!codeRecord) {
      await recordFailedAttempt(ip, "/recovery/verify");
      res.status(401).json({ error: "Código inválido o expirado" });
      return;
    }

    // Increment attempts
    await query(
      `UPDATE uni_recovery_codes SET attempts = attempts + 1 WHERE id = $1`,
      [codeRecord.id]
    );

    // Block after 3 failed attempts
    if (codeRecord.attempts >= 3) {
      await query(`UPDATE uni_recovery_codes SET used = TRUE WHERE id = $1`, [codeRecord.id]);
      await raiseSecurityEvent({
        eventType: "recovery_code_max_attempts",
        severity: "critical",
        userId: user.id,
        ip,
      });
      res.status(401).json({ error: "Demasiados intentos fallidos. Solicitá un nuevo código." });
      return;
    }

    const valid = await bcrypt.compare(code, codeRecord.code_hash);
    if (!valid) {
      await recordFailedAttempt(ip, "/recovery/verify");
      res.status(401).json({ error: "Código inválido o expirado" });
      return;
    }

    // Mark code as used
    await query(`UPDATE uni_recovery_codes SET used = TRUE WHERE id = $1`, [codeRecord.id]);

    // Issue new tokens — data is fully accessible because keys are server-side
    const deviceMeta = {
      deviceName: (req.headers["x-device-name"] as string) ?? "Nuevo dispositivo (recuperación)",
      devicePlatform: (req.headers["x-device-platform"] as string) ?? "unknown",
      deviceIp: ip,
    };
    const accessToken = signAccessToken(user.id, user.device_id);
    const refreshToken = await signRefreshToken(user.id, deviceMeta);

    await log({
      userId: user.id,
      event: "auth.account_recovered",
      ip,
      severity: "warn",
      metadata: { method: "email_otp" },
    });
    await raiseSecurityEvent({
      eventType: "account_recovered",
      severity: "warn",
      userId: user.id,
      ip,
      metadata: { note: "User recovered account via email OTP" },
    });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, network_plan: user.network_plan },
      message: "Cuenta recuperada correctamente. Todos tus datos están disponibles.",
    });
  }
);

// ─── Get recovery status (authenticated) ─────────────────────────────────────
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const user = await queryOne<{ recovery_email_enc: string | null; recovery_email_hash: string | null }>(
    `SELECT recovery_email_enc, recovery_email_hash FROM uni_users WHERE id = $1`,
    [req.user!.sub]
  );

  const hasEmail = !!user?.recovery_email_hash;
  let maskedEmail: string | null = null;

  if (hasEmail && user?.recovery_email_enc) {
    try {
      const plain = await decryptFieldAsync(user.recovery_email_enc, req.user!.sub);
      const [localPart, domain] = plain.split("@");
      maskedEmail = `${localPart.slice(0, 2)}***@${domain}`;
    } catch { /* ignore */ }
  }

  res.json({ hasRecoveryEmail: hasEmail, maskedEmail });
});

export default router;

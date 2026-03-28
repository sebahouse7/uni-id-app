import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
import { signAccessToken, signRefreshToken, rotateRefreshToken, revokeAllUserTokens } from "../lib/jwt";
import { hashDeviceId } from "../lib/crypto";
import { hashEmail, encryptFieldAsync } from "../lib/keyManager";
import { log } from "../lib/audit";
import { recordFailedAttempt, raiseSecurityEvent } from "../lib/monitor";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

function getDeviceMeta(req: Request) {
  return {
    deviceName: (req.headers["x-device-name"] as string) ?? "Desconocido",
    devicePlatform: (req.headers["x-device-platform"] as string) ?? "unknown",
    deviceIp: req.ip ?? "unknown",
  };
}

// Register or login via device ID
router.post(
  "/register",
  [
    body("deviceId").isString().isLength({ min: 16, max: 256 }).trim(),
    body("name").isString().isLength({ min: 1, max: 100 }).trim().escape(),
    body("bio").optional().isString().isLength({ max: 300 }).trim().escape(),
    body("recoveryEmail").optional().isEmail().normalizeEmail(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { deviceId, name, bio, recoveryEmail } = req.body;
    const ip = req.ip ?? "unknown";
    const ua = req.headers["user-agent"];
    const deviceMeta = getDeviceMeta(req);

    try {
      const hashedDevice = hashDeviceId(deviceId);
      let user = await queryOne<{ id: string; name: string; network_plan: string }>(
        `SELECT id, name, network_plan FROM uni_users WHERE device_id = $1`,
        [hashedDevice]
      );

      let isNew = false;
      if (!user) {
        const rows = await query<{ id: string; name: string; network_plan: string }>(
          `INSERT INTO uni_users (device_id, name, bio, network_plan)
           VALUES ($1, $2, $3, 'free')
           RETURNING id, name, network_plan`,
          [hashedDevice, name, bio ?? null]
        );
        user = rows[0];
        isNew = true;
        // Optionally store recovery email at registration
        if (recoveryEmail) {
          const emailHash = hashEmail(recoveryEmail);
          const emailEnc = await encryptFieldAsync(recoveryEmail, user.id);
          await query(
            `UPDATE uni_users SET recovery_email_enc = $1, recovery_email_hash = $2 WHERE id = $3`,
            [emailEnc, emailHash, user.id]
          );
        }
        await log({ userId: user.id, event: "auth.register", ip, userAgent: ua, metadata: { platform: deviceMeta.devicePlatform, hasRecoveryEmail: !!recoveryEmail } });
      } else {
        await log({ userId: user.id, event: "auth.login", ip, userAgent: ua, metadata: { platform: deviceMeta.devicePlatform } });
      }

      const accessToken = signAccessToken(user.id, hashedDevice);
      const refreshToken = await signRefreshToken(user.id, deviceMeta);

      res.json({ accessToken, refreshToken, user, isNew });
    } catch (err: any) {
      await recordFailedAttempt(ip, "/auth/register");
      await log({ event: "auth.register_error", severity: "warn", ip, metadata: { error: err.message } });
      res.status(500).json({ error: "Error al registrar" });
    }
  }
);

// Refresh access token
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const ip = req.ip ?? "unknown";

  if (!refreshToken || typeof refreshToken !== "string") {
    res.status(400).json({ error: "refreshToken requerido" });
    return;
  }

  const deviceMeta = getDeviceMeta(req);
  const result = await rotateRefreshToken(refreshToken, deviceMeta);

  if (!result) {
    await recordFailedAttempt(ip, "/auth/refresh");
    await raiseSecurityEvent({
      eventType: "refresh_token_invalid",
      severity: "warn",
      ip,
      metadata: { hint: "Possible stolen token attempt" },
    });
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  await log({ userId: result.userId, event: "auth.token_refreshed", ip });
  res.json({ accessToken: result.accessToken, refreshToken: result.newRefresh });
});

// Logout — revoke all tokens
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  await revokeAllUserTokens(req.user!.sub);
  await log({ userId: req.user!.sub, event: "auth.logout", ip: req.ip });
  res.json({ ok: true });
});

// Get current user profile
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await queryOne(
    `SELECT id, name, bio, network_plan, plan_expires_at, created_at FROM uni_users WHERE id = $1`,
    [req.user!.sub]
  );
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(user);
});

// Update profile
router.patch(
  "/me",
  requireAuth,
  [
    body("name").optional().isString().isLength({ min: 1, max: 100 }).trim().escape(),
    body("bio").optional().isString().isLength({ max: 300 }).trim().escape(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { name, bio } = req.body;
    const user = await queryOne(
      `UPDATE uni_users SET name = COALESCE($1, name), bio = COALESCE($2, bio), updated_at = NOW()
       WHERE id = $3 RETURNING id, name, bio, network_plan`,
      [name ?? null, bio ?? null, req.user!.sub]
    );
    await log({ userId: req.user!.sub, event: "profile.updated", ip: req.ip });
    res.json(user);
  }
);

export default router;

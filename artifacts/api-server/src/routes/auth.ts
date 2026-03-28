import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { query, queryOne } from "../lib/db";
import { signAccessToken, signRefreshToken, rotateRefreshToken, revokeAllUserTokens } from "../lib/jwt";
import { hashDeviceId } from "../lib/crypto";
import { log } from "../lib/audit";
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

// Register or login via device ID
router.post(
  "/register",
  [
    body("deviceId").isString().isLength({ min: 16, max: 256 }).trim(),
    body("name").isString().isLength({ min: 1, max: 100 }).trim().escape(),
  ],
  async (req: Request, res: Response) => {
    if (!validate(req, res)) return;
    const { deviceId, name, bio } = req.body;
    const ip = req.ip ?? "unknown";
    const ua = req.headers["user-agent"];

    try {
      const hashedDevice = hashDeviceId(deviceId);
      let user = await queryOne<{ id: string; name: string; network_plan: string }>(
        `SELECT id, name, network_plan FROM uni_users WHERE device_id = $1`,
        [hashedDevice]
      );

      if (!user) {
        const rows = await query<{ id: string; name: string; network_plan: string }>(
          `INSERT INTO uni_users (device_id, name, bio, network_plan)
           VALUES ($1, $2, $3, 'free')
           RETURNING id, name, network_plan`,
          [hashedDevice, name, bio ?? null]
        );
        user = rows[0];
        await log({ userId: user.id, event: "auth.register", ip, userAgent: ua });
      } else {
        await log({ userId: user.id, event: "auth.login", ip, userAgent: ua });
      }

      const accessToken = signAccessToken(user.id, hashedDevice);
      const refreshToken = await signRefreshToken(user.id);

      res.json({ accessToken, refreshToken, user });
    } catch (err: any) {
      await log({ event: "auth.register_error", severity: "warn", ip, metadata: { error: err.message } });
      res.status(500).json({ error: "Error al registrar" });
    }
  }
);

// Refresh access token
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== "string") {
    res.status(400).json({ error: "refreshToken requerido" });
    return;
  }
  const result = await rotateRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  await log({ userId: result.userId, event: "auth.token_refreshed", ip: req.ip });
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

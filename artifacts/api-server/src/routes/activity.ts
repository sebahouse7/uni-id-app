import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { logActivity, getActivityLogs, getActivityDetail, countActivity, ActionType, ActivityResult, ActivityTrust } from "../lib/activityLog";
import { generalLimiter } from "../middlewares/rateLimit";

const router = Router();

// ── POST /activity — registrar evento desde el cliente (offline, etc.) ────

router.post("/", requireAuth, generalLimiter, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const {
    actionType,
    context,
    target,
    dataShared,
    hash,
    signature,
    result,
    trustLevel,
  } = req.body as {
    actionType?: string;
    context?: string;
    target?: string;
    dataShared?: string[];
    hash?: string;
    signature?: string;
    result?: string;
    trustLevel?: string;
  };

  const VALID_TYPES: ActionType[] = ["share","verify","receive","sign","login","payment","offline"];
  if (!actionType || !VALID_TYPES.includes(actionType as ActionType)) {
    res.status(400).json({ error: "actionType inválido" });
    return;
  }

  const device = req.get("X-Device-Name") ?? req.get("User-Agent")?.slice(0, 60) ?? null;

  logActivity({
    userId,
    actionType: actionType as ActionType,
    context: typeof context === "string" ? context.slice(0, 100) : undefined,
    target:  typeof target  === "string" ? target.slice(0, 200)  : undefined,
    dataShared: Array.isArray(dataShared) ? dataShared.slice(0, 20) : undefined,
    hash:      typeof hash      === "string" ? hash.slice(0, 128)     : undefined,
    signature: typeof signature === "string" ? signature              : undefined,
    result:    (["success","rejected","pending"].includes(result as string) ? result : "success") as ActivityResult,
    trustLevel: (["high","medium","low"].includes(trustLevel as string) ? trustLevel : undefined) as ActivityTrust | undefined,
    ip:     req.ip ?? undefined,
    device: device ?? undefined,
  });

  res.status(201).json({ ok: true });
});

// ── GET /activity — lista paginada con filtros ─────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const {
    type,
    context,
    from,
    to,
    limit: limitStr,
    offset: offsetStr,
  } = req.query as Record<string, string | undefined>;

  const limit  = Math.min(parseInt(limitStr  ?? "50", 10), 100);
  const offset = parseInt(offsetStr ?? "0", 10);

  const VALID_TYPES: ActionType[] = ["share","verify","receive","sign","login","payment","offline"];
  const typeSafe = (type && VALID_TYPES.includes(type as ActionType)) ? (type as ActionType) : undefined;

  const fromDate = from ? new Date(from) : undefined;
  const toDate   = to   ? new Date(to)   : undefined;

  try {
    const [logs, total] = await Promise.all([
      getActivityLogs(userId, { type: typeSafe, context, from: fromDate, to: toDate, limit, offset }),
      countActivity(userId),
    ]);

    res.json({
      data: logs,
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener registro de actividad" });
  }
});

// ── GET /activity/:id — detalle completo ──────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const id = String(req.params["id"] ?? "");

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const entry = await getActivityDetail(userId, id);
    if (!entry) {
      res.status(404).json({ error: "Evento no encontrado" });
      return;
    }
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener evento" });
  }
});

export default router;

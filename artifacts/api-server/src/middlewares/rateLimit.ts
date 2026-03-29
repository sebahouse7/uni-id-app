import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: "Cuenta temporalmente bloqueada por intentos fallidos. Intentá en 15 min." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const shareViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Demasiadas solicitudes. Esperá un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Demasiadas solicitudes." },
  standardHeaders: true,
  legacyHeaders: false,
});

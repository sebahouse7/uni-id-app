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

/**
 * Strict limiter for unauthenticated public share endpoints.
 * Prevents token scanning / enumeration / flood attacks.
 * 10 requests per IP per 5 minutes.
 */
export const requestAccessLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos de acceso. Esperá 5 minutos antes de reintentar." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Limiter for QR code creation — prevent token spam.
 * 20 per 10 minutes per authenticated user (keyed by IP since auth is checked in handler).
 */
export const createQrLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados códigos QR generados. Esperá 10 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

import nodemailer from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  return {
    host,
    port,
    user,
    pass,
    secure: port === 465,
    from: process.env["SMTP_FROM"] ?? `uni.id <noreply@uni.id>`,
  };
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: process.env["NODE_ENV"] === "production" },
  });
}

export async function sendEmail(opts: MailOptions): Promise<{ sent: boolean; previewCode?: string; error?: string }> {
  const config = getSmtpConfig();

  if (!config) {
    // Dev mode: log the OTP to console (NEVER in production)
    console.warn(`[EMAIL DEV] ═══════════════════════════════`);
    console.warn(`[EMAIL DEV] To:      ${opts.to}`);
    console.warn(`[EMAIL DEV] Subject: ${opts.subject}`);
    console.warn(`[EMAIL DEV] Body:    ${opts.text}`);
    console.warn(`[EMAIL DEV] ═══════════════════════════════`);
    return { sent: false, previewCode: opts.text };
  }

  try {
    const transporter = createTransporter(config);
    await transporter.sendMail({ from: config.from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    console.info(`[EMAIL] Sent to ${opts.to} — ${opts.subject}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[EMAIL ERROR] Failed to send to ${opts.to}: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

/**
 * Verifica la conexión SMTP. Devuelve { ok: true } si la autenticación funciona.
 * Llamar desde el endpoint /api/monitor/email-test (solo en desarrollo).
 */
export async function testSmtpConnection(): Promise<{ ok: boolean; configured: boolean; host?: string; port?: number; error?: string }> {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, configured: false };
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    return { ok: true, configured: true, host: config.host, port: config.port };
  } catch (err: any) {
    return { ok: false, configured: true, host: config.host, port: config.port, error: err.message };
  }
}

/**
 * Verificación al arrancar el servidor.
 * Loguea si SMTP está configurado y si la conexión funciona.
 */
export async function checkSmtpOnStartup(): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    console.warn("[EMAIL] SMTP no configurado — los emails solo se mostrarán en consola (modo desarrollo).");
    console.warn("[EMAIL] Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM para producción.");
    return;
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    console.info(`[EMAIL] ✅ SMTP conectado — ${config.host}:${config.port} (desde: ${config.from})`);
  } catch (err: any) {
    console.error(`[EMAIL] ❌ SMTP configurado pero la conexión falló: ${err.message}`);
    console.error(`[EMAIL] Revisa SMTP_HOST=${config.host}, SMTP_PORT=${config.port}, SMTP_USER=${config.user}`);
  }
}

interface RecoveryEmailContext {
  ip?: string;
  device?: string;
  requestedAt?: string;
}

export function buildRecoveryEmail(
  code: string,
  lang = "es",
  context: RecoveryEmailContext = {}
): { subject: string; html: string; text: string } {

  const strings: Record<string, {
    subject: string; greeting: string; subtitle: string; body: string; cta: string;
    expires: string; ignore: string; securityTitle: string; securityNote: string;
    deviceLabel: string; ipLabel: string; timeLabel: string; noShare: string;
  }> = {
    es: {
      subject: "Código de recuperación — uni.id",
      greeting: "Recuperación de cuenta",
      subtitle: "Recibimos una solicitud para acceder a tu cuenta desde un nuevo dispositivo.",
      body: "Tu código de verificación es:",
      cta: "Ingresá este código en la app para recuperar tu cuenta.",
      expires: "Válido por 10 minutos · Un solo uso",
      ignore: "Si no solicitaste este código, ignorá este mensaje. Tu cuenta sigue segura.",
      securityTitle: "Información de seguridad",
      securityNote: "Si no reconocés esta solicitud, te recomendamos cambiar tu PIN en la app lo antes posible.",
      deviceLabel: "Dispositivo",
      ipLabel: "IP de origen",
      timeLabel: "Hora de solicitud",
      noShare: "Nunca compartas este código con nadie. uni.id jamás te lo va a pedir.",
    },
    en: {
      subject: "Recovery code — uni.id",
      greeting: "Account recovery",
      subtitle: "We received a request to access your account from a new device.",
      body: "Your verification code is:",
      cta: "Enter this code in the app to recover your account.",
      expires: "Valid for 10 minutes · Single use",
      ignore: "If you didn't request this code, ignore this message. Your account remains secure.",
      securityTitle: "Security information",
      securityNote: "If you don't recognize this request, we recommend changing your PIN in the app as soon as possible.",
      deviceLabel: "Device",
      ipLabel: "Source IP",
      timeLabel: "Request time",
      noShare: "Never share this code with anyone. uni.id will never ask you for it.",
    },
    pt: {
      subject: "Código de recuperação — uni.id",
      greeting: "Recuperação de conta",
      subtitle: "Recebemos uma solicitação para acessar sua conta de um novo dispositivo.",
      body: "Seu código de verificação é:",
      cta: "Digite este código no app para recuperar sua conta.",
      expires: "Válido por 10 minutos · Uso único",
      ignore: "Se não solicitou este código, ignore esta mensagem. Sua conta continua segura.",
      securityTitle: "Informações de segurança",
      securityNote: "Se não reconhece esta solicitação, recomendamos alterar seu PIN no app o mais rápido possível.",
      deviceLabel: "Dispositivo",
      ipLabel: "IP de origem",
      timeLabel: "Hora da solicitação",
      noShare: "Nunca compartilhe este código com ninguém. O uni.id jamais vai pedir isso.",
    },
  };

  const t = strings[lang] ?? strings["es"]!;

  // Format the code with a space in the middle for readability: 847 291
  const formattedCode = code.length === 6
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : code;

  const requestedAt = context.requestedAt
    ?? new Date().toLocaleString(lang === "en" ? "en-US" : lang === "pt" ? "pt-BR" : "es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "medium",
        timeStyle: "short",
      });

  // Security context block — only shown if device or IP is present
  const hasContext = context.device || context.ip;
  const contextBlock = hasContext ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A1020;border:1px solid #1A3060;border-radius:10px;margin:0 0 20px">
            <tr><td style="padding:14px 18px;border-bottom:1px solid #0F1E3A">
              <p style="margin:0;color:#7A8BAA;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${t.securityTitle}</p>
            </td></tr>
            ${context.device ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #0A1830">
              <p style="margin:0;color:#5566AA;font-size:11px">${t.deviceLabel}</p>
              <p style="margin:2px 0 0;color:#B0C0DD;font-size:13px;font-weight:500">${context.device}</p>
            </td></tr>` : ""}
            ${context.ip ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #0A1830">
              <p style="margin:0;color:#5566AA;font-size:11px">${t.ipLabel}</p>
              <p style="margin:2px 0 0;color:#B0C0DD;font-size:13px;font-weight:500">${context.ip}</p>
            </td></tr>` : ""}
            <tr><td style="padding:10px 18px">
              <p style="margin:0;color:#5566AA;font-size:11px">${t.timeLabel}</p>
              <p style="margin:2px 0 0;color:#B0C0DD;font-size:13px;font-weight:500">${requestedAt}</p>
            </td></tr>
          </table>` : "";

  const plainText = [
    `uni.id — ${t.greeting}`,
    ``,
    t.subtitle,
    ``,
    `${t.body}`,
    ``,
    `  ${formattedCode}`,
    ``,
    `${t.expires}`,
    ``,
    t.cta,
    ``,
    `──────────────────`,
    t.ignore,
    ``,
    ...(context.device ? [`${t.deviceLabel}: ${context.device}`] : []),
    ...(context.ip ? [`${t.ipLabel}: ${context.ip}`] : []),
    `${t.timeLabel}: ${requestedAt}`,
    ``,
    t.noShare,
    ``,
    `Uniid © 2026 · human.id labs S.A.S.`,
  ].join("\n");

  return {
    subject: t.subject,
    text: plainText,
    html: `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#060B18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060B18;padding:32px 16px 40px">
    <tr><td align="center">
      <table width="100%" style="max-width:500px;background:#0D1525;border-radius:18px;border:1px solid #1A3060;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0A1628 0%,#0D1F4A 100%);padding:24px 32px 20px;border-bottom:1px solid #1A3060">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><h1 style="margin:0;color:#00D4FF;font-size:22px;font-weight:800;letter-spacing:-0.5px">uni.id</h1>
                  <p style="margin:3px 0 0;color:#4A6080;font-size:12px">human.id labs</p></td>
              <td align="right"><span style="background:#1A3060;color:#00D4FF;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;letter-spacing:0.5px">🔐 SEGURIDAD</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 24px">
          <h2 style="margin:0 0 8px;color:#E8F0FF;font-size:20px;font-weight:700">${t.greeting}</h2>
          <p style="margin:0 0 28px;color:#7A90B0;font-size:14px;line-height:1.6">${t.subtitle}</p>

          <p style="margin:0 0 12px;color:#8899BB;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${t.body}</p>

          <!-- Code box -->
          <div style="background:#050A14;border:2px solid #1A6FE8;border-radius:14px;padding:28px 16px;text-align:center;margin:0 0 12px;box-shadow:0 0 24px rgba(26,111,232,0.15)">
            <span style="font-family:'Courier New',Courier,monospace;font-size:52px;font-weight:800;color:#00D4FF;letter-spacing:16px;display:block;line-height:1">${formattedCode}</span>
          </div>
          <p style="margin:0 0 28px;color:#4A6080;font-size:12px;text-align:center;font-weight:500">${t.expires}</p>

          <p style="margin:0 0 24px;color:#B0C0DD;font-size:14px;line-height:1.6">${t.cta}</p>

          <!-- Ignore notice -->
          <div style="background:#0A1520;border-left:3px solid #1A6FE8;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 24px">
            <p style="margin:0;color:#7A90B0;font-size:13px;line-height:1.6">⚠️ &nbsp;${t.ignore}</p>
          </div>

          <!-- Security context block -->
          ${contextBlock}

          <hr style="border:none;border-top:1px solid #0F1E3A;margin:0 0 16px">
          <p style="margin:0;color:#3A5070;font-size:12px;line-height:1.6">${t.noShare}</p>
        </td></tr>

        <!-- Legal footer -->
        <tr><td style="background:#070D1E;padding:16px 32px;border-top:1px solid #0A1530">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;color:#2A3A55;font-size:11px;line-height:1.6">
                Uniid © 2026 · human.id labs S.A.S.<br>
                Sebastián Maximiliano Monteleón · DNI 32.725.461<br>
                Todos los derechos reservados.
              </p></td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

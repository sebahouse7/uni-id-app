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

export function buildRecoveryEmail(code: string, lang = "es"): { subject: string; html: string; text: string } {
  const templates: Record<string, { subject: string; greeting: string; body: string; footer: string; cta: string }> = {
    es: {
      subject: "Código de recuperación — uni.id",
      greeting: "Recuperación de cuenta",
      body: `Tu código de recuperación es:`,
      cta: `Ingresá este código en la app. Es válido por 10 minutos y solo funciona una vez.`,
      footer: "Si no solicitaste este código, alguien podría estar intentando acceder a tu cuenta. No compartas este código con nadie.",
    },
    en: {
      subject: "Recovery code — uni.id",
      greeting: "Account recovery",
      body: `Your recovery code is:`,
      cta: `Enter this code in the app. It's valid for 10 minutes and can only be used once.`,
      footer: "If you didn't request this code, someone might be trying to access your account. Never share this code with anyone.",
    },
    pt: {
      subject: "Código de recuperação — uni.id",
      greeting: "Recuperação de conta",
      body: `Seu código de recuperação é:`,
      cta: `Digite este código no app. É válido por 10 minutos e só funciona uma vez.`,
      footer: "Se não solicitou este código, alguém pode estar tentando acessar sua conta. Nunca compartilhe este código.",
    },
  };

  const t = templates[lang] ?? templates["es"]!;
  const plainText = `uni.id — ${t.greeting}\n\nCódigo: ${code}\n\n${t.cta}\n\n${t.footer}\n\nhuman.id labs S.A.S.`;

  return {
    subject: t.subject,
    text: plainText,
    html: `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#060B18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060B18;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#0D1525;border-radius:16px;border:1px solid #1A3060;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0A1628 0%,#0D1F4A 100%);padding:28px 32px;border-bottom:1px solid #1A3060">
          <h1 style="margin:0;color:#00D4FF;font-size:24px;font-weight:700;letter-spacing:-0.5px">uni.id</h1>
          <p style="margin:4px 0 0;color:#8899BB;font-size:13px">human.id labs</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px;color:#E8F0FF;font-size:18px;font-weight:600">${t.greeting}</h2>
          <p style="margin:0 0 24px;color:#B0C0DD;font-size:15px;line-height:1.5">${t.body}</p>
          <!-- Code box -->
          <div style="background:#060B18;border:2px solid #1A6FE8;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
            <span style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;color:#00D4FF;letter-spacing:12px">${code}</span>
          </div>
          <p style="margin:0 0 24px;color:#8899BB;font-size:14px;line-height:1.6">${t.cta}</p>
          <hr style="border:none;border-top:1px solid #1A2540;margin:0 0 20px">
          <p style="margin:0;color:#5566AA;font-size:12px;line-height:1.5">${t.footer}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#070D1E;padding:16px 32px;border-top:1px solid #0F1E3A">
          <p style="margin:0;color:#3A4A6A;font-size:11px">human.id labs S.A.S. · Sebastián Maximiliano Monteleón · DNI 32.725.461</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
